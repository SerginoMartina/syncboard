CREATE SCHEMA IF NOT EXISTS syncboard;

COMMENT ON SCHEMA syncboard IS 'Persistent data owned by the SyncBoard application.';

CREATE TABLE IF NOT EXISTS syncboard.rooms (
    id text PRIMARY KEY,
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    owner_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rooms_name_case_insensitive_unique_idx
    ON syncboard.rooms (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS syncboard.canvas_shapes (
    room_id text NOT NULL REFERENCES syncboard.rooms (id) ON DELETE CASCADE,
    id text NOT NULL,
    type text NOT NULL CHECK (type IN ('line', 'rect', 'freehand', 'text')),
    points jsonb NOT NULL CHECK (jsonb_typeof(points) = 'array'),
    color text NOT NULL CHECK (length(btrim(color)) > 0),
    width double precision NOT NULL CHECK (width > 0),
    text_content text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, id)
);

ALTER TABLE syncboard.canvas_shapes
    ADD COLUMN IF NOT EXISTS text_content text;

ALTER TABLE syncboard.canvas_shapes
    DROP CONSTRAINT IF EXISTS canvas_shapes_type_check;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'canvas_shapes_type_allowed'
          AND conrelid = 'syncboard.canvas_shapes'::regclass
    ) THEN
        ALTER TABLE syncboard.canvas_shapes
            ADD CONSTRAINT canvas_shapes_type_allowed
            CHECK (type IN ('line', 'rect', 'freehand', 'text'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'canvas_shapes_text_content_required'
          AND conrelid = 'syncboard.canvas_shapes'::regclass
    ) THEN
        ALTER TABLE syncboard.canvas_shapes
            ADD CONSTRAINT canvas_shapes_text_content_required
            CHECK (
                (type = 'text' AND text_content IS NOT NULL AND length(btrim(text_content)) > 0)
                OR (type <> 'text' AND text_content IS NULL)
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS canvas_shapes_room_created_at_idx
    ON syncboard.canvas_shapes (room_id, created_at, id);

CREATE TABLE IF NOT EXISTS syncboard.chat_messages (
    id text PRIMARY KEY,
    room_id text NOT NULL REFERENCES syncboard.rooms (id) ON DELETE CASCADE,
    user_id text NOT NULL,
    user_name text NOT NULL CHECK (length(btrim(user_name)) > 0),
    user_color text NOT NULL CHECK (user_color ~ '^#[0-9A-Fa-f]{6}$'),
    body text NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 2000),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_room_created_at_idx
    ON syncboard.chat_messages (room_id, created_at, id);
