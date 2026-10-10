import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUp, ArrowUpRight, Check, Circle, Expand, Highlighter, Loader2, MessageCircle, Minimize2, Minus, Pencil, Plus, Radio, RefreshCw, Square, Trash2, Type, X } from 'lucide-react';
import Canvas from './components/canvas/Canvas';
import { useRooms } from './hooks/useRooms';
import { useSocket, type ChatMessage, type GuestUser, type RoomUser } from './hooks/useSocket';
import type { Room } from './services/rooms';
import { useCanvasStore } from './store/canvasStore';

const makeGuest = (): GuestUser => {
  const id = localStorage.getItem('syncboard-user-id') || crypto.randomUUID();
  localStorage.setItem('syncboard-user-id', id);
  const palette = ['#4f8cff', '#c084fc', '#f97316', '#22c55e', '#ec4899', '#06b6d4'];
  const colorIndex = [...id].reduce((total, character) => total + character.charCodeAt(0), 0) % palette.length;
  return {
    id,
    name: localStorage.getItem('syncboard-user-name') || '',
    color: localStorage.getItem('syncboard-user-color') || palette[colorIndex],
  };
};

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';

function Avatar({ name, color, size = 'normal' }: { name: string; color: string; size?: 'normal' | 'small' }) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ backgroundColor: color }}
      title={name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}

function RoomWorkspace({
  room,
  user,
  onExit,
  expanded,
  onToggleExpanded,
}: {
  room: Room;
  user: GuestUser;
  onExit: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const [messageDraft, setMessageDraft] = useState('');
  const [chatOpen, setChatOpen] = useState(() => !window.matchMedia('(max-width: 760px)').matches);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const currentTool = useCanvasStore((state) => state.currentTool);
  const setTool = useCanvasStore((state) => state.setTool);
  const currentColor = useCanvasStore((state) => state.currentColor);
  const setColor = useCanvasStore((state) => state.set_color);
  const {
    isConnected,
    presence,
    messages,
    error,
    roomDeleted,
    clearError,
    sendDraw,
    sendCursor,
    sendMessage,
  } = useSocket(room.id, user);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (roomDeleted) onExit();
  }, [roomDeleted, onExit]);

  const handleSendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = messageDraft.trim();
    if (!body) return;
    sendMessage(body);
    setMessageDraft('');
  };

  return (
    <section className="workspace" aria-label={`Room ${room.name}`}>
      <div className="room-heading">
        <div className="room-heading-copy">
          <button className="back-button" onClick={onExit} aria-label="Back to rooms" title="Back to rooms">
            <ArrowLeft size={18} />
          </button>
          <div>
            <span className="eyebrow">COLLABORATIVE BOARD</span>
            <h2>{room.name}</h2>
          </div>
        </div>
        <div className="presence-area">
          <span className="online-indicator"><Circle size={8} fill="currentColor" /> Online</span>
          <div className="avatar-stack" aria-label={`${presence.length} people in this room`}>
            {presence.map((member: RoomUser) => (
              <span className="online-person" key={member.socketId}>
                <Avatar name={member.name} color={member.color} size="small" />
                <span>{member.name}</span>
              </span>
            ))}
          </div>
          <div className="presence-copy">
            <span>{presence.length} {presence.length === 1 ? 'person' : 'people'} here</span>
            <span className={`connection-status ${isConnected ? 'is-connected' : ''}`}>
              <Circle size={7} fill="currentColor" />
              {isConnected ? 'Connected' : 'Connecting'}
            </span>
          </div>
        </div>
      </div>

      <div className="workbench">
        <div className="canvas-column">
          <div className="canvas-toolbar">
            <div className="drawing-tools" role="toolbar" aria-label="Drawing tools">
              <button type="button" className={currentTool === 'freehand' ? 'drawing-tool-active' : ''} onClick={() => setTool('freehand')} aria-label="Pen" title="Pen" aria-pressed={currentTool === 'freehand'}><Pencil size={16} /></button>
              <button type="button" className={currentTool === 'line' ? 'drawing-tool-active' : ''} onClick={() => setTool('line')} aria-label="Line" title="Line" aria-pressed={currentTool === 'line'}><Minus size={16} /></button>
              <button type="button" className={currentTool === 'rect' ? 'drawing-tool-active' : ''} onClick={() => setTool('rect')} aria-label="Rectangle" title="Rectangle" aria-pressed={currentTool === 'rect'}><Square size={16} /></button>
              <button type="button" className={currentTool === 'ellipse' ? 'drawing-tool-active' : ''} onClick={() => setTool('ellipse')} aria-label="Ellipse" title="Ellipse" aria-pressed={currentTool === 'ellipse'}><Circle size={16} /></button>
              <button type="button" className={currentTool === 'arrow' ? 'drawing-tool-active' : ''} onClick={() => setTool('arrow')} aria-label="Arrow" title="Arrow" aria-pressed={currentTool === 'arrow'}><ArrowUpRight size={16} /></button>
              <button type="button" className={currentTool === 'highlighter' ? 'drawing-tool-active' : ''} onClick={() => setTool('highlighter')} aria-label="Highlighter" title="Highlighter" aria-pressed={currentTool === 'highlighter'}><Highlighter size={16} /></button>
              <button type="button" className={currentTool === 'text' ? 'drawing-tool-active' : ''} onClick={() => setTool('text')} aria-label="Text" title="Text" aria-pressed={currentTool === 'text'}><Type size={16} /></button>
            </div>
            <label className="color-control" title="Choose drawing color">
              <input
                type="color"
                value={currentColor}
                onChange={(event) => setColor(event.target.value)}
                aria-label="Drawing color"
              />
              <span>Color</span>
            </label>
            <button
              type="button"
              className="board-expand-button"
              onClick={onToggleExpanded}
              aria-label={expanded ? 'Minimize drawing board' : 'Expand drawing board'}
              title={expanded ? 'Minimize board (Esc)' : 'Expand board'}
            >
              {expanded ? <Minimize2 size={15} /> : <Expand size={15} />}
              <span>{expanded ? 'Minimize' : 'Full screen'}</span>
            </button>
            <span className="toolbar-hint">{currentTool === 'line' ? 'Drag to draw a straight line' : currentTool === 'arrow' ? 'Drag to draw an arrow' : currentTool === 'ellipse' ? 'Drag to draw an ellipse' : currentTool === 'highlighter' ? 'Drag to highlight an area' : currentTool === 'text' ? 'Click anywhere to add a text label' : 'Draw together, in real time'}</span>
          </div>
          <div className="canvas-frame">
            <Canvas userId={user.id} sendDraw={sendDraw} sendCursor={sendCursor} expanded={expanded} />
          </div>
          {expanded && <span className="pan-hint">Hold Space and drag to move around the board</span>}
          {error && (
            <button className="inline-error" onClick={clearError} role="alert">
              {error} <span>Dismiss</span>
            </button>
          )}
        </div>

        {chatOpen && <aside className="chat-panel" aria-label="Room chat">
          <div className="chat-header">
            <div className="chat-title-icon"><MessageCircle size={16} /></div>
            <div>
              <h3>Room chat</h3>
              <p>Say hello to your collaborators</p>
            </div>
            <button type="button" className="chat-close-button" onClick={() => setChatOpen(false)} aria-label="Close room chat" title="Close chat">
              <X size={16} />
            </button>
          </div>
          <div className="chat-messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <span className="chat-empty-icon"><MessageCircle size={19} /></span>
                <strong>Start the conversation</strong>
                <span>Messages are saved in this room.</span>
              </div>
            ) : messages.map((message: ChatMessage) => (
              <article className={`chat-message ${message.userId === user.id ? 'message-own' : ''}`} key={message.id}>
                <Avatar name={message.name} color={message.color} size="small" />
                <div className="message-content">
                  <div className="message-meta">
                    <strong>{message.name}</strong>
                    <time dateTime={message.createdAt}>
                      {new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </time>
                  </div>
                  <p>{message.body}</p>
                </div>
              </article>
            ))}
            <div ref={endOfMessagesRef} />
          </div>
          <form className="chat-composer" onSubmit={handleSendMessage}>
            <textarea
              value={messageDraft}
              onChange={(event) => setMessageDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={`Message as ${user.name}...`}
              maxLength={2000}
              rows={2}
              aria-label="Write a chat message"
            />
            <button type="submit" disabled={!messageDraft.trim()} aria-label="Send message">
              <ArrowUp size={17} />
            </button>
            <span>Enter to send · Shift + Enter for a new line</span>
          </form>
        </aside>}
        {!chatOpen && (
          <button type="button" className="chat-launcher" onClick={() => setChatOpen(true)} aria-label="Open room chat">
            <MessageCircle size={18} />
            <span>Chat</span>
          </button>
        )}
      </div>
    </section>
  );
}

function App() {
  const { data: rooms, isLoading, isError, error, refetch, createRoom, isCreatingRoom, createRoomError, deleteRoom, isDeletingRoom } = useRooms();
  const [user, setUser] = useState<GuestUser>(makeGuest);
  const [nameDraft, setNameDraft] = useState(user.name);
  const [roomName, setRoomName] = useState('');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [roomFormError, setRoomFormError] = useState('');
  const [roomDeleteError, setRoomDeleteError] = useState('');
  const [boardExpanded, setBoardExpanded] = useState(false);
  const activeRoom = rooms?.find((room) => room.id === activeRoomId) ?? null;

  useEffect(() => {
    if (!boardExpanded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBoardExpanded(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [boardExpanded]);

  const saveName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = nameDraft.trim().slice(0, 32);
    if (!name) return;
    localStorage.setItem('syncboard-user-name', name);
    setUser((current) => ({ ...current, name }));
  };

  const handleCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = roomName.trim();
    if (!name || !user.name) return;
    setRoomFormError('');
    if (rooms?.some((room) => room.name.trim().toLowerCase() === name.toLowerCase())) {
      setRoomFormError('A room with this name already exists.');
      return;
    }
    try {
      const room = await createRoom({ name, ownerId: user.id });
      setRoomName('');
      setActiveRoomId(room.id);
    } catch (createError) {
      setRoomFormError(createError instanceof Error ? createError.message : 'Could not create the room.');
    }
  };

  const handleDeleteRoom = async (room: Room) => {
    const confirmed = window.confirm(
      `Delete "${room.name}"? This permanently removes the room, its drawings, and its chat history.`,
    );
    if (!confirmed) return;
    setRoomDeleteError('');
    try {
      await deleteRoom({ roomId: room.id, ownerId: user.id });
      if (activeRoomId === room.id) setActiveRoomId(null);
    } catch (deleteError) {
      setRoomDeleteError(deleteError instanceof Error ? deleteError.message : 'Could not delete room.');
    }
  };

  const handleRoomDeletedByOwner = () => {
    setActiveRoomId(null);
    void refetch();
  };

  return (
    <main className={`app-shell ${boardExpanded ? 'board-fullscreen' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Pencil size={18} /></span>
          <span>syncboard</span>
        </div>

        <div className="sidebar-section">
          <div className="section-heading">
            <span>YOUR WORKSPACES</span>
            <span className="room-count">{rooms?.length ?? 0}</span>
          </div>
          <form className="create-room-form" onSubmit={handleCreateRoom}>
            <label htmlFor="new-room-name">Create a room</label>
            <div className="create-room-input">
              <input
                id="new-room-name"
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                placeholder="e.g. Product ideas"
                maxLength={80}
                required
              />
              <button type="submit" disabled={!user.name || !roomName.trim() || isCreatingRoom} aria-label="Create room">
                {isCreatingRoom ? <Loader2 size={17} className="spin" /> : <Plus size={17} />}
              </button>
            </div>
            {!user.name && <p className="form-hint">Add your name below to create a room.</p>}
            {(roomFormError || createRoomError) && <p className="form-error" role="alert">{roomFormError || createRoomError?.message}</p>}
          </form>
          {roomDeleteError && <p className="form-error room-delete-error" role="alert">{roomDeleteError}</p>}

          <nav className="room-list" aria-label="Available rooms">
            {isLoading ? (
              <div className="list-state"><Loader2 size={16} className="spin" /> Loading rooms</div>
            ) : isError ? (
              <div className="list-state list-error">
                <span>{error instanceof Error ? error.message : 'Could not load rooms.'}</span>
                <button onClick={() => void refetch()}><RefreshCw size={14} /> Retry</button>
              </div>
            ) : rooms?.length ? rooms.map((room) => (
              <div className={`room-list-item ${activeRoomId === room.id ? 'room-list-item-active' : ''}`} key={room.id}>
                <button
                  type="button"
                  className={`room-link ${activeRoomId === room.id ? 'room-link-active' : ''}`}
                  onClick={() => setActiveRoomId(room.id)}
                  disabled={!user.name}
                  title={!user.name ? 'Enter your name to join' : room.name}
                >
                  <span className="room-link-icon">#</span>
                  <span className="room-link-name">{room.name}</span>
                </button>
                {room.ownerId === user.id && (
                  <button
                    type="button"
                    className="room-delete-button"
                    onClick={() => void handleDeleteRoom(room)}
                    disabled={isDeletingRoom}
                    aria-label={`Delete ${room.name}`}
                    title="Delete room"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )) : (
              <div className="list-empty">No rooms yet. Create one to get started.</div>
            )}
          </nav>
        </div>

        <form className="profile-card" onSubmit={saveName}>
          <div className="profile-heading">YOUR PROFILE</div>
          <div className="profile-row">
            <Avatar name={user.name || 'You'} color={user.color} />
            <div className="profile-fields">
              <label htmlFor="display-name">Display name</label>
              <input
                id="display-name"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="What should we call you?"
                maxLength={32}
                required
              />
            </div>
          </div>
          <button className="save-profile-button" type="submit" disabled={!nameDraft.trim() || nameDraft.trim() === user.name}>
            {nameDraft.trim() === user.name ? <><Check size={14} /> Name saved</> : 'Save name'}
          </button>
        </form>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            {activeRoom && <><span className="breadcrumb-divider">/</span><strong>{activeRoom.name}</strong></>}
          </div>
          <div className="topbar-user">
            <Radio size={14} />
            <span>{user.name || 'Guest'}</span>
            <Avatar name={user.name || 'You'} color={user.color} size="small" />
          </div>
        </header>

        {activeRoom ? (
          <RoomWorkspace
            room={activeRoom}
            user={user}
            onExit={handleRoomDeletedByOwner}
            expanded={boardExpanded}
            onToggleExpanded={() => setBoardExpanded((expanded) => !expanded)}
          />
        ) : (
          <section className="welcome-panel">
            <div className="welcome-content">
              <div className="welcome-art" aria-hidden="true">
                <span className="art-dot art-dot-one" />
                <span className="art-dot art-dot-two" />
                <span className="art-dot art-dot-three" />
                <span className="art-board"><Pencil size={34} strokeWidth={1.5} /></span>
              </div>
              <span className="eyebrow">A LITTLE SPACE TO THINK TOGETHER</span>
              <h1>{!user.name ? 'First, what should we call you?' : rooms?.length ? 'Pick up where ideas happen.' : 'Make room for good ideas.'}</h1>
              <p>
                {!user.name
                  ? 'Add your name in the sidebar, then join a room or create one with your team.'
                  : rooms?.length
                    ? 'Choose a workspace on the left to open its board and chat with everyone there.'
                    : 'There are no boards yet. Create your first room on the left and invite your collaborators.'}
              </p>
              {!rooms?.length && !isLoading && !isError && (
                <div className="welcome-tip"><span>✦</span> Every room has its own saved board and conversation.</div>
              )}
            </div>
          </section>
        )}
        <footer className="app-footer">
          <span>Ideas are better together.</span>
          <span>SyncBoard <span className="footer-dot">·</span> collaborative canvas</span>
        </footer>
      </div>
    </main>
  );
}

export default App;
