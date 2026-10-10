import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Check,
  Circle,
  Expand,
  Highlighter,
  Loader2,
  MessageCircle,
  Minimize2,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Sparkles,
  Square,
  StickyNote,
  Trash2,
  Type,
  Users,
  X,
} from "lucide-react";
import Canvas from "./components/canvas/Canvas";
import { useRooms } from "./hooks/useRooms";
import {
  useSocket,
  type ChatMessage,
  type ChatPoll,
  type GuestUser,
  type RoomUser,
} from "./hooks/useSocket";
import { askLocalAssistant } from "./services/assistant";
import type { ProposedDrawing } from "./services/assistant";
import {
  fetchProfile,
  ProfileSaveError,
  saveProfile,
} from "./services/profiles";
import type { Room } from "./services/rooms";
import { useCanvasStore, type Shape } from "./store/canvasStore";

const makeGuest = (): GuestUser => {
  const id = localStorage.getItem("syncboard-user-id") || crypto.randomUUID();
  localStorage.setItem("syncboard-user-id", id);
  const palette = [
    "#4f8cff",
    "#c084fc",
    "#f97316",
    "#22c55e",
    "#ec4899",
    "#06b6d4",
  ];
  const colorIndex =
    [...id].reduce((total, character) => total + character.charCodeAt(0), 0) %
    palette.length;
  return {
    id,
    name: localStorage.getItem("syncboard-user-name") || "",
    color: localStorage.getItem("syncboard-user-color") || palette[colorIndex],
    avatarUrl: null,
  };
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
const formatChatDate = (date: string) =>
  new Date(date).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function Avatar({
  name,
  color,
  avatarUrl,
  size = "normal",
}: {
  name: string;
  color: string;
  avatarUrl?: string | null;
  size?: "normal" | "small";
}) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ backgroundColor: color }}
      title={name}
      aria-label={name}
    >
      {avatarUrl ? (
        <img className="avatar-image" src={avatarUrl} alt="" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

const readProfileImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      reject(new Error("Choose a PNG, JPEG, or WebP image."));
      return;
    }
    if (file.size > 512 * 1024) {
      reject(new Error("Choose an image smaller than 512 KB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read that image."));
    };
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });

function WelcomeFlow({
  step,
  displayName,
  onDisplayNameChange,
  onStart,
  nameError,
  suggestedName,
  onChooseSuggestedName,
  onBack,
  onNext,
}: {
  step: number;
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  onStart: (event: FormEvent<HTMLFormElement>) => void;
  nameError: string;
  suggestedName: string | null;
  onChooseSuggestedName: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const pages = [
    {
      eyebrow: "A SHARED SPACE FOR IDEAS",
      title: "Welcome to SyncBoard",
      description:
        "A calm place to think together. Start by choosing the name your collaborators will see.",
      icon: <Pencil size={26} />,
    },
    {
      eyebrow: "STEP 1 OF 3",
      title: "Create or join a room",
      description:
        "Rooms keep each team’s drawings and conversations together. Create a room for a new idea, or open one from your workspace list.",
      icon: <Users size={26} />,
    },
    {
      eyebrow: "STEP 2 OF 3",
      title: "Make ideas visible",
      description:
        "Draw with the pen, shapes, arrows, and highlighter, or add labels with Text. Your work is shared live and saved to its room.",
      icon: <Pencil size={26} />,
    },
    {
      eyebrow: "STEP 3 OF 3",
      title: "Think together",
      description:
        "Use chat to discuss, create polls to decide, or switch on the private AI assistant. If it suggests a board drawing, you approve it in chat before it appears.",
      icon: <MessageCircle size={26} />,
    },
  ];
  const page = pages[step];

  return (
    <main className="welcome-flow">
      <div className="welcome-flow-brand">
        <span className="brand-mark">
          <Pencil size={18} />
        </span>{" "}
        syncboard
      </div>
      <section
        className="welcome-flow-card"
        aria-labelledby="welcome-flow-title"
      >
        <div className="welcome-flow-icon">{page.icon}</div>
        <span className="eyebrow">{page.eyebrow}</span>
        <h1 id="welcome-flow-title">{page.title}</h1>
        <p>{page.description}</p>
        {step === 0 ? (
          <form className="welcome-name-form" onSubmit={onStart}>
            <label htmlFor="welcome-display-name">Your display name</label>
            <input
              autoFocus
              id="welcome-display-name"
              value={displayName}
              onChange={(event) => onDisplayNameChange(event.target.value)}
              placeholder="e.g. Alex"
              maxLength={32}
              required
            />
            {nameError && (
              <div className="profile-name-error" role="alert">
                <span>{nameError}</span>
                {suggestedName && (
                  <button type="button" onClick={onChooseSuggestedName}>
                    Use “{suggestedName}”
                  </button>
                )}
              </div>
            )}
            <button
              className="welcome-primary-button"
              type="submit"
              disabled={!displayName.trim()}
            >
              Continue <ArrowUpRight size={16} />
            </button>
          </form>
        ) : (
          <>
            <div
              className="welcome-flow-progress"
              aria-label={`Introduction page ${step} of 3`}
            >
              {pages.slice(1).map((item, index) => (
                <span
                  key={item.eyebrow}
                  className={index + 1 <= step ? "welcome-progress-active" : ""}
                />
              ))}
            </div>
            <div className="welcome-flow-actions">
              <button
                className="welcome-back-button"
                type="button"
                onClick={onBack}
              >
                <ArrowLeft size={15} /> Back
              </button>
              <button
                className="welcome-primary-button"
                type="button"
                onClick={onNext}
              >
                {step === pages.length - 1 ? "Start creating" : "Next"}{" "}
                <ArrowUpRight size={16} />
              </button>
            </div>
          </>
        )}
      </section>
      <span className="welcome-flow-footer">Your space to think together</span>
    </main>
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
  const [messageDraft, setMessageDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedMessageDraft, setEditedMessageDraft] = useState("");
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(
    () => !window.matchMedia("(max-width: 760px)").matches,
  );
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [assistantMode, setAssistantMode] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<
    {
      id: string;
      createdAt: string;
      question: string;
      answer: string;
      drawing: ProposedDrawing | null;
      drawingStatus: "pending" | "approved" | "rejected" | "failed";
    }[]
  >([]);
  const [assistantError, setAssistantError] = useState("");
  const [isAskingAssistant, setIsAskingAssistant] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const currentTool = useCanvasStore((state) => state.currentTool);
  const setTool = useCanvasStore((state) => state.setTool);
  const setColor = useCanvasStore((state) => state.set_color);
  const currentColor = useCanvasStore((state) => state.currentColor);
  const {
    isConnected,
    presence,
    messages,
    polls,
    error,
    roomDeleted,
    clearError,
    sendDraw,
    updateShape,
    deleteShape,
    sendCursor,
    sendMessage,
    editMessage,
    deleteMessage,
    deletePoll,
    createPoll,
    votePoll,
  } = useSocket(room.id, user);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [
    messages.length,
    polls.length,
    assistantMessages.length,
    isAskingAssistant,
  ]);

  useEffect(() => {
    setAssistantMessages([]);
    setAssistantError("");
    setSelectedShapeId(null);
  }, [room.id]);

  const handleDeleteSelectedShape = async () => {
    if (!selectedShapeId) return;
    if (await deleteShape(selectedShapeId)) setSelectedShapeId(null);
  };

  useEffect(() => {
    if (roomDeleted) onExit();
  }, [roomDeleted, onExit]);

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = messageDraft.trim();
    if (!body) return;
    if (assistantMode) {
      setMessageDraft("");
      setAssistantError("");
      setIsAskingAssistant(true);
      try {
        const answer = await askLocalAssistant(room.id, body);
        setAssistantMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            question: body,
            answer: answer.answer,
            drawing: answer.drawing,
            drawingStatus: "pending",
          },
        ]);
      } catch (error) {
        setAssistantError(
          error instanceof Error
            ? error.message
            : "The local assistant could not answer right now.",
        );
      } finally {
        setIsAskingAssistant(false);
      }
      return;
    }
    sendMessage(body);
    setMessageDraft("");
  };

  const handleEditMessage = async (
    event: FormEvent<HTMLFormElement>,
    messageId: string,
  ) => {
    event.preventDefault();
    const body = editedMessageDraft.trim();
    if (!body) return;
    if (await editMessage(messageId, body)) {
      setEditingMessageId(null);
      setEditedMessageDraft("");
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!window.confirm("Remove this message from the room chat?")) return;
    if ((await deleteMessage(messageId)) && editingMessageId === messageId) {
      setEditingMessageId(null);
      setEditedMessageDraft("");
    }
  };

  const handleDeletePoll = async (pollId: string) => {
    if (!window.confirm("Remove this poll and its votes from the room?"))
      return;
    await deletePoll(pollId);
  };

  const handleCanvasSizeChange = useCallback(
    (size: { width: number; height: number }) => {
      setCanvasSize((current) =>
        current.width === size.width && current.height === size.height
          ? current
          : size,
      );
    },
    [],
  );

  const approveDrawing = (assistantMessageId: string) => {
    const item = assistantMessages.find(
      (message) => message.id === assistantMessageId,
    );
    if (!item?.drawing || item.drawingStatus !== "pending") return;
    if (!isConnected || !canvasSize.width || !canvasSize.height) {
      setAssistantError("Connect to the room before adding this drawing.");
      return;
    }

    const shapes: Shape[] = item.drawing.shapes.map((proposed) => {
      const [[startX, startY], [endX, endY]] = proposed.points;
      const points: [[number, number], [number, number]] = [
        [startX * canvasSize.width, startY * canvasSize.height],
        [endX * canvasSize.width, endY * canvasSize.height],
      ];
      return {
        id: crypto.randomUUID(),
        type: proposed.type,
        points,
        color: proposed.color || currentColor,
        width: 2,
        ...(proposed.type === "text" ? { text: proposed.text } : {}),
      };
    });
    const sentCount = shapes.reduce(
      (count, shape) => count + Number(sendDraw(shape)),
      0,
    );
    if (sentCount !== shapes.length) {
      setAssistantError(
        sentCount
          ? "The connection dropped while adding the drawing. Some shapes may have been sent; check the board before trying again."
          : "The drawing could not be sent. Reconnect to the room and try again.",
      );
      if (sentCount) {
        setAssistantMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? { ...message, drawingStatus: "failed" }
              : message,
          ),
        );
      }
      return;
    }
    setAssistantMessages((current) =>
      current.map((message) =>
        message.id === assistantMessageId
          ? { ...message, drawingStatus: "approved" }
          : message,
      ),
    );
    setAssistantError("");
  };

  const rejectDrawing = (assistantMessageId: string) => {
    setAssistantMessages((current) =>
      current.map((message) =>
        message.id === assistantMessageId
          ? { ...message, drawingStatus: "rejected" }
          : message,
      ),
    );
  };

  const handleCreatePoll = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = pollQuestion.trim();
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (!question || options.length < 2) return;
    createPoll(question, options);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollComposerOpen(false);
  };

  const timelineItems = [
    ...messages.map((message) => ({
      id: message.id,
      createdAt: message.createdAt,
      kind: "message" as const,
      message,
    })),
    ...polls.map((poll) => ({
      id: poll.id,
      createdAt: poll.createdAt,
      kind: "poll" as const,
      poll,
    })),
    ...assistantMessages.map((assistant) => ({
      id: assistant.id,
      createdAt: assistant.createdAt,
      kind: "assistant" as const,
      assistant,
    })),
  ].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

  return (
    <section className="workspace" aria-label={`Room ${room.name}`}>
      <div className="room-heading">
        <div className="room-heading-copy">
          <button
            className="back-button"
            onClick={onExit}
            aria-label="Back to rooms"
            title="Back to rooms"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <span className="eyebrow">COLLABORATIVE BOARD</span>
            <h2>{room.name}</h2>
          </div>
        </div>
        <div className="presence-area">
          <span className="online-indicator">
            <Circle size={8} fill="currentColor" /> Online
          </span>
          <div
            className="avatar-stack"
            aria-label={`${presence.length} people in this room`}
          >
            {presence.map((member: RoomUser) => (
              <span className="online-person" key={member.socketId}>
                <Avatar
                  name={member.name}
                  color={member.color}
                  avatarUrl={member.avatarUrl}
                  size="small"
                />
                <span>{member.name}</span>
              </span>
            ))}
          </div>
          <div className="presence-copy">
            <span>
              {presence.length} {presence.length === 1 ? "person" : "people"}{" "}
              here
            </span>
            <span
              className={`connection-status ${isConnected ? "is-connected" : ""}`}
            >
              <Circle size={7} fill="currentColor" />
              {isConnected ? "Connected" : "Connecting"}
            </span>
          </div>
        </div>
      </div>

      <div className="workbench">
        <div className="canvas-column">
          <div className="canvas-toolbar">
            <div
              className="drawing-tools"
              role="toolbar"
              aria-label="Drawing tools"
            >
              <button
                type="button"
                className={
                  currentTool === "select" ? "drawing-tool-active" : ""
                }
                onClick={() => setTool("select")}
                aria-label="Select and move"
                title="Select and move"
                aria-pressed={currentTool === "select"}
              >
                <MousePointer2 size={16} />
              </button>
              <button
                type="button"
                className={
                  currentTool === "freehand" ? "drawing-tool-active" : ""
                }
                onClick={() => setTool("freehand")}
                aria-label="Pen"
                title="Pen"
                aria-pressed={currentTool === "freehand"}
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                className={currentTool === "line" ? "drawing-tool-active" : ""}
                onClick={() => setTool("line")}
                aria-label="Line"
                title="Line"
                aria-pressed={currentTool === "line"}
              >
                <Minus size={16} />
              </button>
              <button
                type="button"
                className={currentTool === "rect" ? "drawing-tool-active" : ""}
                onClick={() => setTool("rect")}
                aria-label="Rectangle"
                title="Rectangle"
                aria-pressed={currentTool === "rect"}
              >
                <Square size={16} />
              </button>
              <button
                type="button"
                className={
                  currentTool === "ellipse" ? "drawing-tool-active" : ""
                }
                onClick={() => setTool("ellipse")}
                aria-label="Ellipse"
                title="Ellipse"
                aria-pressed={currentTool === "ellipse"}
              >
                <Circle size={16} />
              </button>
              <button
                type="button"
                className={currentTool === "arrow" ? "drawing-tool-active" : ""}
                onClick={() => setTool("arrow")}
                aria-label="Arrow"
                title="Arrow"
                aria-pressed={currentTool === "arrow"}
              >
                <ArrowUpRight size={16} />
              </button>
              <button
                type="button"
                className={
                  currentTool === "highlighter" ? "drawing-tool-active" : ""
                }
                onClick={() => setTool("highlighter")}
                aria-label="Highlighter"
                title="Highlighter"
                aria-pressed={currentTool === "highlighter"}
              >
                <Highlighter size={16} />
              </button>
              <button
                type="button"
                className={currentTool === "text" ? "drawing-tool-active" : ""}
                onClick={() => setTool("text")}
                aria-label="Text"
                title="Text"
                aria-pressed={currentTool === "text"}
              >
                <Type size={16} />
              </button>
              <button
                type="button"
                className={
                  currentTool === "sticky" ? "drawing-tool-active" : ""
                }
                onClick={() => setTool("sticky")}
                aria-label="Post-it note"
                title="Post-it note"
                aria-pressed={currentTool === "sticky"}
              >
                <StickyNote size={16} />
              </button>
            </div>
            <button
              type="button"
              className="remove-selected-button"
              onClick={() => void handleDeleteSelectedShape()}
              disabled={!selectedShapeId}
              aria-label="Remove selected board item"
              title={
                selectedShapeId
                  ? "Remove selected item (Delete)"
                  : "Select an item to remove it"
              }
            >
              <Trash2 size={15} />
            </button>
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
              aria-label={
                expanded ? "Minimize drawing board" : "Expand drawing board"
              }
              title={expanded ? "Minimize board (Esc)" : "Expand board"}
            >
              {expanded ? <Minimize2 size={15} /> : <Expand size={15} />}
              <span>{expanded ? "Minimize" : "Full screen"}</span>
            </button>
            <span className="toolbar-hint">
              {currentTool === "select"
                ? "Select and drag an item · Delete removes it"
                : currentTool === "line"
                  ? "Drag to draw a straight line"
                  : currentTool === "arrow"
                    ? "Drag to draw an arrow"
                    : currentTool === "ellipse"
                      ? "Drag to draw an ellipse"
                      : currentTool === "highlighter"
                        ? "Drag to highlight an area"
                        : currentTool === "text"
                          ? "Click anywhere to add a text label"
                          : currentTool === "sticky"
                            ? "Click the board to place a post-it note"
                            : "Draw together, in real time"}
            </span>
          </div>
          <div className="canvas-frame">
            <Canvas
              userId={user.id}
              sendDraw={sendDraw}
              moveShape={updateShape}
              deleteShape={deleteShape}
              selectedShapeId={selectedShapeId}
              onSelectedShapeChange={setSelectedShapeId}
              sendCursor={sendCursor}
              expanded={expanded}
              onCanvasSizeChange={handleCanvasSizeChange}
            />
          </div>
          {expanded && (
            <span className="pan-hint">
              Hold Space and drag to move around the board
            </span>
          )}
          {error && (
            <button className="inline-error" onClick={clearError} role="alert">
              {error} <span>Dismiss</span>
            </button>
          )}
        </div>

        {chatOpen && (
          <aside className="chat-panel" aria-label="Room chat">
            <div className="chat-header">
              <div className="chat-title-icon">
                <MessageCircle size={16} />
              </div>
              <div>
                <h3>Room chat</h3>
                <p>Say hello to your collaborators</p>
              </div>
              <button
                type="button"
                className="chat-close-button"
                onClick={() => setChatOpen(false)}
                aria-label="Close room chat"
                title="Close chat"
              >
                <X size={16} />
              </button>
            </div>
            {pollComposerOpen && (
              <form className="poll-composer" onSubmit={handleCreatePoll}>
                <label htmlFor="poll-question">Ask a question</label>
                <input
                  id="poll-question"
                  value={pollQuestion}
                  onChange={(event) => setPollQuestion(event.target.value)}
                  placeholder="What should we decide?"
                  maxLength={200}
                  required
                />
                {pollOptions.map((option, index) => (
                  <input
                    key={index}
                    value={option}
                    onChange={(event) =>
                      setPollOptions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item,
                        ),
                      )
                    }
                    placeholder={`Option ${index + 1}`}
                    maxLength={100}
                    required={index < 2}
                    aria-label={`Poll option ${index + 1}`}
                  />
                ))}
                <div className="poll-composer-actions">
                  {pollOptions.length < 6 && (
                    <button
                      type="button"
                      className="poll-add-option"
                      onClick={() =>
                        setPollOptions((current) => [...current, ""])
                      }
                    >
                      <Plus size={13} /> Add option
                    </button>
                  )}
                  <button
                    type="button"
                    className="poll-cancel-button"
                    onClick={() => setPollComposerOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="poll-submit-button"
                    disabled={
                      !pollQuestion.trim() ||
                      pollOptions.filter((option) => option.trim()).length < 2
                    }
                  >
                    Create poll
                  </button>
                </div>
              </form>
            )}
            <div className="chat-messages" aria-live="polite">
              {timelineItems.length === 0 && !isAskingAssistant ? (
                <div className="chat-empty">
                  <span className="chat-empty-icon">
                    <MessageCircle size={19} />
                  </span>
                  <strong>Start the conversation</strong>
                  <span>Messages are saved in this room.</span>
                </div>
              ) : (
                timelineItems.map((timelineItem) => {
                  if (timelineItem.kind === "poll") {
                    const poll = timelineItem.poll;
                    const totalVotes = poll.options.reduce(
                      (total, option) => total + option.votes,
                      0,
                    );
                    return (
                      <article className="poll-card" key={`poll-${poll.id}`}>
                        <div className="poll-card-heading">
                          <strong>{poll.question}</strong>
                          <div className="poll-heading-meta">
                            <span>
                              {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
                            </span>
                            <time dateTime={poll.createdAt}>
                              {formatChatDate(poll.createdAt)}
                            </time>
                            {poll.creatorId === user.id && (
                              <button
                                type="button"
                                onClick={() => void handleDeletePoll(poll.id)}
                                aria-label="Delete poll"
                                title="Delete poll"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="poll-options">
                          {poll.options.map((option) => {
                            const percent = totalVotes
                              ? Math.round((option.votes / totalVotes) * 100)
                              : 0;
                            const selected =
                              poll.selectedOptionId === option.id;
                            return (
                              <button
                                className={`poll-option ${selected ? "poll-option-selected" : ""}`}
                                key={option.id}
                                type="button"
                                onClick={() => votePoll(poll.id, option.id)}
                                aria-pressed={selected}
                                title={
                                  selected
                                    ? "Your vote — click another option to change it"
                                    : "Vote for this option"
                                }
                              >
                                <span
                                  className="poll-option-progress"
                                  style={{ width: `${percent}%` }}
                                />
                                <span className="poll-option-label">
                                  {option.text}
                                </span>
                                <span className="poll-option-percent">
                                  {percent}%
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <span className="poll-creator">
                          Poll by {poll.creatorName}
                          {poll.selectedOptionId ? " · Your vote is in" : ""}
                        </span>
                      </article>
                    );
                  }

                  if (timelineItem.kind === "assistant") {
                    const item = timelineItem.assistant;
                    return (
                      <article
                        className="assistant-thread"
                        key={`assistant-${item.id}`}
                      >
                        <time
                          className="assistant-thread-date"
                          dateTime={item.createdAt}
                        >
                          {formatChatDate(item.createdAt)}
                        </time>
                        <p className="assistant-question">{item.question}</p>
                        <div className="assistant-answer">
                          <span>
                            <Sparkles size={12} /> Local assistant
                          </span>
                          <p>{item.answer}</p>
                        </div>
                        {item.drawing && (
                          <div className="drawing-approval">
                            <strong>Proposed board drawing</strong>
                            <p>{item.drawing.summary}</p>
                            {item.drawingStatus === "pending" ? (
                              <div className="drawing-approval-actions">
                                <button
                                  type="button"
                                  className="drawing-approve-button"
                                  onClick={() => approveDrawing(item.id)}
                                >
                                  <Check size={13} /> Add to board
                                </button>
                                <button
                                  type="button"
                                  className="drawing-reject-button"
                                  onClick={() => rejectDrawing(item.id)}
                                >
                                  Not now
                                </button>
                              </div>
                            ) : (
                              <span
                                className={`drawing-approval-status ${item.drawingStatus}`}
                              >
                                {item.drawingStatus === "approved"
                                  ? "Added to the shared board"
                                  : item.drawingStatus === "rejected"
                                    ? "Drawing discarded"
                                    : "Could not add the complete drawing"}
                              </span>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  }

                  const message = timelineItem.message;
                  const ownMessage = message.userId === user.id;
                  return (
                    <article
                      className={`chat-message ${ownMessage ? "message-own" : ""}`}
                      key={`message-${message.id}`}
                    >
                      <Avatar
                        name={message.name}
                        color={message.color}
                        avatarUrl={message.avatarUrl}
                        size="small"
                      />
                      <div className="message-content">
                        <div className="message-meta">
                          <strong>{message.name}</strong>
                          <time dateTime={message.createdAt}>
                            {formatChatDate(message.createdAt)}
                          </time>
                          {message.editedAt && (
                            <span className="message-edited-label">edited</span>
                          )}
                        </div>
                        {editingMessageId === message.id ? (
                          <form
                            className="message-edit-form"
                            onSubmit={(event) =>
                              void handleEditMessage(event, message.id)
                            }
                          >
                            <textarea
                              autoFocus
                              value={editedMessageDraft}
                              onChange={(event) =>
                                setEditedMessageDraft(event.target.value)
                              }
                              maxLength={2000}
                              rows={2}
                              aria-label="Edit your message"
                            />
                            <div>
                              <button
                                type="button"
                                onClick={() => setEditingMessageId(null)}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={!editedMessageDraft.trim()}
                              >
                                Save
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <p>{message.body}</p>
                          </>
                        )}
                      </div>
                      {ownMessage && (
                        <div className="message-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessageId(message.id);
                              setEditedMessageDraft(message.body);
                            }}
                            aria-label="Edit message"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteMessage(message.id)}
                            aria-label="Delete message"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
              {isAskingAssistant && (
                <div className="assistant-thinking" role="status">
                  <Sparkles size={14} /> Thinking with the local model…
                </div>
              )}
              {assistantError && (
                <div className="assistant-error" role="alert">
                  {assistantError}
                  <button
                    type="button"
                    onClick={() => setAssistantError("")}
                    aria-label="Dismiss assistant error"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              <div ref={endOfMessagesRef} />
            </div>
            <form
              className={`chat-composer ${assistantMode ? "assistant-mode" : ""}`}
              onSubmit={(event) => void handleSendMessage(event)}
            >
              <textarea
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={
                  assistantMode
                    ? "Ask the private local assistant…"
                    : `Message as ${user.name}...`
                }
                maxLength={2000}
                rows={2}
                aria-label="Write a chat message"
                disabled={isAskingAssistant}
              />
              <button
                type="submit"
                disabled={!messageDraft.trim() || isAskingAssistant}
                aria-label={
                  assistantMode ? "Ask local assistant" : "Send message"
                }
              >
                {isAskingAssistant ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <ArrowUp size={17} />
                )}
              </button>
              <button
                type="button"
                className={`assistant-mode-toggle ${assistantMode ? "assistant-mode-toggle-active" : ""}`}
                onClick={() => {
                  setAssistantMode((enabled) => !enabled);
                  setPollComposerOpen(false);
                  setAssistantError("");
                }}
                aria-pressed={assistantMode}
                title="Ask the self-hosted local AI. Your prompt is not shared in room chat."
              >
                <Sparkles size={14} /> AI
              </button>
              <button
                type="button"
                className="poll-compose-trigger"
                onClick={() => {
                  setAssistantMode(false);
                  setPollComposerOpen((open) => !open);
                }}
                aria-expanded={pollComposerOpen}
              >
                <BarChart3 size={14} /> Poll
              </button>
              <span>
                {assistantMode
                  ? "Private · answered by this app’s local model"
                  : "Enter to send · Shift + Enter for a new line"}
              </span>
            </form>
          </aside>
        )}
        {!chatOpen && (
          <button
            type="button"
            className="chat-launcher"
            onClick={() => setChatOpen(true)}
            aria-label="Open room chat"
          >
            <MessageCircle size={18} />
            <span>Chat</span>
          </button>
        )}
      </div>
    </section>
  );
}

function App() {
  const {
    data: rooms,
    isLoading,
    isError,
    error,
    refetch,
    createRoom,
    isCreatingRoom,
    createRoomError,
    deleteRoom,
    isDeletingRoom,
  } = useRooms();
  const [user, setUser] = useState<GuestUser>(makeGuest);
  const [nameDraft, setNameDraft] = useState(user.name);
  const [profileImageDraft, setProfileImageDraft] = useState<
    string | null | undefined
  >(undefined);
  const [profileNameError, setProfileNameError] = useState("");
  const [profileNameSuggestion, setProfileNameSuggestion] = useState<
    string | null
  >(null);
  const [profileImageError, setProfileImageError] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState("");
  const [onboardingStep, setOnboardingStep] = useState(() => {
    if (!user.name) return 0;
    if (
      localStorage.getItem("syncboard-onboarding-started") !== "true" ||
      localStorage.getItem("syncboard-onboarding-complete") === "true"
    )
      return -1;
    const savedStep = Number(localStorage.getItem("syncboard-onboarding-step"));
    return Number.isInteger(savedStep) && savedStep >= 0 && savedStep <= 3
      ? savedStep
      : 1;
  });
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [roomFormError, setRoomFormError] = useState("");
  const [roomDeleteError, setRoomDeleteError] = useState("");
  const [boardExpanded, setBoardExpanded] = useState(false);
  const activeRoom = rooms?.find((room) => room.id === activeRoomId) ?? null;

  useEffect(() => {
    let isCurrent = true;
    const hydrateProfile = async () => {
      try {
        const savedProfile = await fetchProfile(user.id);
        if (savedProfile) {
          if (!isCurrent) return;
          localStorage.setItem("syncboard-user-name", savedProfile.displayName);
          localStorage.setItem("syncboard-user-color", savedProfile.color);
          setUser((current) => ({
            ...current,
            name: savedProfile.displayName,
            color: savedProfile.color,
            avatarUrl: savedProfile.avatarUrl,
          }));
          setNameDraft(savedProfile.displayName);
          return;
        }

        if (user.name) {
          const savedLegacyProfile = await saveProfile({
            userId: user.id,
            displayName: user.name,
            color: user.color,
          });
          if (!isCurrent) return;
          localStorage.setItem(
            "syncboard-user-name",
            savedLegacyProfile.displayName,
          );
          localStorage.setItem(
            "syncboard-user-color",
            savedLegacyProfile.color,
          );
          setUser((current) => ({
            ...current,
            name: savedLegacyProfile.displayName,
            color: savedLegacyProfile.color,
            avatarUrl: savedLegacyProfile.avatarUrl,
          }));
          setNameDraft(savedLegacyProfile.displayName);
        }
      } catch (loadError) {
        if (!isCurrent) return;
        if (loadError instanceof ProfileSaveError && loadError.suggestion) {
          setProfileNameError(loadError.message);
          setProfileNameSuggestion(loadError.suggestion);
          setUser((current) => ({ ...current, name: "" }));
          setOnboardingStep(0);
        } else {
          setProfileLoadError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load your profile.",
          );
        }
      } finally {
        if (isCurrent) setProfileLoading(false);
      }
    };
    void hydrateProfile();
    return () => {
      isCurrent = false;
    };
  }, [user.id]);

  useEffect(() => {
    if (!boardExpanded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBoardExpanded(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [boardExpanded]);

  const applySavedProfile = (
    profile: Awaited<ReturnType<typeof saveProfile>>,
  ) => {
    localStorage.setItem("syncboard-user-name", profile.displayName);
    localStorage.setItem("syncboard-user-color", profile.color);
    setUser((current) => ({
      ...current,
      name: profile.displayName,
      color: profile.color,
      avatarUrl: profile.avatarUrl,
    }));
    setNameDraft(profile.displayName);
    setProfileImageDraft(undefined);
    setProfileNameError("");
    setProfileNameSuggestion(null);
    setProfileImageError("");
  };

  const handleProfileSaveError = (saveError: unknown) => {
    if (saveError instanceof ProfileSaveError) {
      setProfileNameError(saveError.message);
      setProfileNameSuggestion(saveError.suggestion);
      return;
    }
    setProfileNameError(
      saveError instanceof Error
        ? saveError.message
        : "Could not save your profile.",
    );
    setProfileNameSuggestion(null);
  };

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = nameDraft.trim().slice(0, 32);
    if (!name) return;
    setProfileNameError("");
    try {
      const profile = await saveProfile({
        userId: user.id,
        displayName: name,
        color: user.color,
        avatarData: profileImageDraft,
      });
      applySavedProfile(profile);
      setProfileDialogOpen(false);
    } catch (saveError) {
      handleProfileSaveError(saveError);
    }
  };

  const startOnboarding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = nameDraft.trim().slice(0, 32);
    if (!name) return;
    setProfileNameError("");
    try {
      const profile = await saveProfile({
        userId: user.id,
        displayName: name,
        color: user.color,
      });
      applySavedProfile(profile);
      localStorage.setItem("syncboard-onboarding-started", "true");
      localStorage.setItem("syncboard-onboarding-step", "1");
      setOnboardingStep(1);
    } catch (saveError) {
      handleProfileSaveError(saveError);
    }
  };

  const chooseSuggestedName = () => {
    if (!profileNameSuggestion) return;
    setNameDraft(profileNameSuggestion);
    setProfileNameError("");
    setProfileNameSuggestion(null);
  };

  const handleProfileImageChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setProfileImageError("");
    try {
      setProfileImageDraft(await readProfileImage(file));
    } catch (imageError) {
      setProfileImageError(
        imageError instanceof Error
          ? imageError.message
          : "Could not use that profile image.",
      );
    }
  };

  const nextOnboardingStep = () => {
    if (onboardingStep >= 3) {
      localStorage.setItem("syncboard-onboarding-complete", "true");
      localStorage.removeItem("syncboard-onboarding-started");
      localStorage.removeItem("syncboard-onboarding-step");
      setOnboardingStep(-1);
      return;
    }
    const nextStep = onboardingStep + 1;
    localStorage.setItem("syncboard-onboarding-step", String(nextStep));
    setOnboardingStep(nextStep);
  };

  const previousOnboardingStep = () => {
    const previousStep = Math.max(0, onboardingStep - 1);
    localStorage.setItem("syncboard-onboarding-step", String(previousStep));
    setOnboardingStep(previousStep);
  };

  const handleCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = roomName.trim();
    if (!name || !user.name) return;
    setRoomFormError("");
    if (
      rooms?.some(
        (room) => room.name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      setRoomFormError("A room with this name already exists.");
      return;
    }
    try {
      const room = await createRoom({ name, ownerId: user.id });
      setRoomName("");
      setActiveRoomId(room.id);
    } catch (createError) {
      setRoomFormError(
        createError instanceof Error
          ? createError.message
          : "Could not create the room.",
      );
    }
  };

  const handleDeleteRoom = async (room: Room) => {
    const confirmed = window.confirm(
      `Delete "${room.name}"? This permanently removes the room, its drawings, and its chat history.`,
    );
    if (!confirmed) return;
    setRoomDeleteError("");
    try {
      await deleteRoom({ roomId: room.id, ownerId: user.id });
      if (activeRoomId === room.id) setActiveRoomId(null);
    } catch (deleteError) {
      setRoomDeleteError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete room.",
      );
    }
  };

  const handleRoomDeletedByOwner = () => {
    setActiveRoomId(null);
    void refetch();
  };

  if (profileLoading) {
    return (
      <main className="profile-loading-screen">
        <Loader2 size={23} className="spin" /> Loading your profile…
      </main>
    );
  }

  if (profileLoadError) {
    return (
      <main
        className="profile-loading-screen profile-loading-error"
        role="alert"
      >
        <p>{profileLoadError}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  }

  if (onboardingStep >= 0) {
    return (
      <WelcomeFlow
        step={onboardingStep}
        displayName={nameDraft}
        onDisplayNameChange={(name) => {
          setNameDraft(name);
          setProfileNameError("");
          setProfileNameSuggestion(null);
        }}
        onStart={startOnboarding}
        nameError={profileNameError}
        suggestedName={profileNameSuggestion}
        onChooseSuggestedName={chooseSuggestedName}
        onBack={previousOnboardingStep}
        onNext={nextOnboardingStep}
      />
    );
  }

  return (
    <main className={`app-shell ${boardExpanded ? "board-fullscreen" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Pencil size={18} />
          </span>
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
              <button
                type="submit"
                disabled={!user.name || !roomName.trim() || isCreatingRoom}
                aria-label="Create room"
              >
                {isCreatingRoom ? (
                  <Loader2 size={17} className="spin" />
                ) : (
                  <Plus size={17} />
                )}
              </button>
            </div>
            {!user.name && (
              <p className="form-hint">Add your name below to create a room.</p>
            )}
            {(roomFormError || createRoomError) && (
              <p className="form-error" role="alert">
                {roomFormError || createRoomError?.message}
              </p>
            )}
          </form>
          {roomDeleteError && (
            <p className="form-error room-delete-error" role="alert">
              {roomDeleteError}
            </p>
          )}

          <nav className="room-list" aria-label="Available rooms">
            {isLoading ? (
              <div className="list-state">
                <Loader2 size={16} className="spin" /> Loading rooms
              </div>
            ) : isError ? (
              <div className="list-state list-error">
                <span>
                  {error instanceof Error
                    ? error.message
                    : "Could not load rooms."}
                </span>
                <button onClick={() => void refetch()}>
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            ) : rooms?.length ? (
              rooms.map((room) => (
                <div
                  className={`room-list-item ${activeRoomId === room.id ? "room-list-item-active" : ""}`}
                  key={room.id}
                >
                  <button
                    type="button"
                    className={`room-link ${activeRoomId === room.id ? "room-link-active" : ""}`}
                    onClick={() => setActiveRoomId(room.id)}
                    disabled={!user.name}
                    title={!user.name ? "Enter your name to join" : room.name}
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
              ))
            ) : (
              <div className="list-empty">
                No rooms yet. Create one to get started.
              </div>
            )}
          </nav>
        </div>

        <div className="profile-card">
          <div className="profile-heading">YOUR PROFILE</div>
          <div className="profile-row">
            <Avatar
              name={user.name || "You"}
              color={user.color}
              avatarUrl={user.avatarUrl}
            />
            <div className="profile-fields">
              <strong className="profile-name">{user.name}</strong>
              <span className="profile-label">Display name</span>
            </div>
          </div>
          <button
            className="edit-profile-button"
            type="button"
            onClick={() => {
              setNameDraft(user.name);
              setProfileImageDraft(undefined);
              setProfileNameError("");
              setProfileNameSuggestion(null);
              setProfileImageError("");
              setProfileDialogOpen(true);
            }}
          >
            <Pencil size={13} /> Edit profile
          </button>
        </div>
      </aside>

      {profileDialogOpen && (
        <div
          className="profile-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setProfileDialogOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setProfileDialogOpen(false);
          }}
        >
          <form
            className="profile-dialog"
            onSubmit={(event) => void saveName(event)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-dialog-title"
          >
            <button
              type="button"
              className="profile-dialog-close"
              onClick={() => setProfileDialogOpen(false)}
              aria-label="Close profile editor"
            >
              <X size={17} />
            </button>
            <div className="profile-dialog-avatar">
              <Avatar
                name={user.name}
                color={user.color}
                avatarUrl={
                  profileImageDraft === undefined
                    ? user.avatarUrl
                    : profileImageDraft
                }
              />
              <div className="profile-image-actions">
                <label
                  className="profile-image-choose"
                  htmlFor="profile-image-file"
                >
                  Change photo
                </label>
                {(profileImageDraft === undefined
                  ? user.avatarUrl
                  : profileImageDraft) && (
                  <button
                    type="button"
                    className="profile-image-remove"
                    onClick={() => setProfileImageDraft(null)}
                  >
                    Remove
                  </button>
                )}
                <input
                  id="profile-image-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => void handleProfileImageChange(event)}
                />
                <span>PNG, JPEG, or WebP · max 512 KB</span>
              </div>
            </div>
            <span className="eyebrow">YOUR PROFILE</span>
            <h2 id="profile-dialog-title">Edit your profile</h2>
            <p>Change how your name appears to people in your rooms.</p>
            <label htmlFor="profile-display-name">Display name</label>
            <input
              autoFocus
              id="profile-display-name"
              value={nameDraft}
              onChange={(event) => {
                setNameDraft(event.target.value);
                setProfileNameError("");
                setProfileNameSuggestion(null);
              }}
              placeholder="What should we call you?"
              maxLength={32}
              required
            />
            {profileNameError && (
              <div className="profile-name-error" role="alert">
                <span>{profileNameError}</span>
                {profileNameSuggestion && (
                  <button type="button" onClick={chooseSuggestedName}>
                    Use “{profileNameSuggestion}”
                  </button>
                )}
              </div>
            )}
            {profileImageError && (
              <div className="profile-name-error" role="alert">
                {profileImageError}
              </div>
            )}
            <div className="profile-dialog-actions">
              <button
                type="button"
                className="profile-dialog-cancel"
                onClick={() => setProfileDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="profile-dialog-save"
                disabled={
                  !nameDraft.trim() ||
                  (nameDraft.trim() === user.name &&
                    profileImageDraft === undefined)
                }
              >
                Save changes
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            {activeRoom && (
              <>
                <span className="breadcrumb-divider">/</span>
                <strong>{activeRoom.name}</strong>
              </>
            )}
          </div>
          <div className="topbar-user">
            <Radio size={14} />
            <span>{user.name || "Guest"}</span>
            <Avatar
              name={user.name || "You"}
              color={user.color}
              avatarUrl={user.avatarUrl}
              size="small"
            />
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
                <span className="art-board">
                  <Pencil size={34} strokeWidth={1.5} />
                </span>
              </div>
              <span className="eyebrow">A LITTLE SPACE TO THINK TOGETHER</span>
              <h1>
                {!user.name
                  ? "First, what should we call you?"
                  : rooms?.length
                    ? "Pick up where ideas happen."
                    : "Make room for good ideas."}
              </h1>
              <p>
                {!user.name
                  ? "Add your name in the sidebar, then join a room or create one with your team."
                  : rooms?.length
                    ? "Choose a workspace on the left to open its board and chat with everyone there."
                    : "There are no boards yet. Create your first room on the left and invite your collaborators."}
              </p>
              {!rooms?.length && !isLoading && !isError && (
                <div className="welcome-tip">
                  <span>✦</span> Every room has its own saved board and
                  conversation.
                </div>
              )}
            </div>
          </section>
        )}
        <footer className="app-footer">
          <span>Ideas are better together.</span>
          <span>
            SyncBoard <span className="footer-dot">·</span> collaborative canvas
          </span>
        </footer>
      </div>
    </main>
  );
}

export default App;
