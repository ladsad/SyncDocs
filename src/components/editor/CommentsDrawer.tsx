"use client";

import React, { useState, useEffect } from "react";
import * as Y from "yjs";
import {
  X,
  MessageSquare,
  CheckCircle,
  CornerDownRight,
  Send,
  Trash2,
  Check,
  User,
  Clock,
  ShieldCheck,
} from "lucide-react";

export interface CommentReply {
  id: string;
  authorName: string;
  authorEmail?: string;
  content: string;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  authorName: string;
  authorEmail?: string;
  content: string;
  selectedText?: string;
  createdAt: string;
  resolved: boolean;
  replies: CommentReply[];
}

interface CommentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  ydoc: Y.Doc | null;
  currentUser: {
    name: string;
    color: string;
    email?: string;
  };
  editable?: boolean;
}

export function CommentsDrawer({
  isOpen,
  onClose,
  ydoc,
  currentUser,
  editable = true,
}: CommentsDrawerProps) {
  const [comments, setComments] = useState<CommentThread[]>([]);
  const [filter, setFilter] = useState<"active" | "resolved">("active");
  const [newCommentText, setNewCommentText] = useState("");
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ydoc) return;

    const yArray = ydoc.getArray<CommentThread>("doc_comments");

    const updateState = () => {
      setComments(yArray.toArray());
    };

    updateState();
    yArray.observe(updateState);

    return () => {
      yArray.unobserve(updateState);
    };
  }, [ydoc]);

  if (!isOpen) return null;

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !ydoc || !editable) return;

    const yArray = ydoc.getArray<CommentThread>("doc_comments");
    const newThread: CommentThread = {
      id: crypto.randomUUID(),
      authorName: currentUser.name || "Anonymous",
      authorEmail: currentUser.email,
      content: newCommentText.trim(),
      createdAt: new Date().toISOString(),
      resolved: false,
      replies: [],
    };

    ydoc.transact(() => {
      yArray.push([newThread]);
    });

    setNewCommentText("");
  };

  const handleToggleResolve = (threadId: string) => {
    if (!ydoc || !editable) return;
    const yArray = ydoc.getArray<CommentThread>("doc_comments");
    const arr = yArray.toArray();
    const index = arr.findIndex((c) => c.id === threadId);
    if (index === -1) return;

    const thread = arr[index];
    const updated: CommentThread = {
      ...thread,
      resolved: !thread.resolved,
    };

    ydoc.transact(() => {
      yArray.delete(index, 1);
      yArray.insert(index, [updated]);
    });
  };

  const handleDeleteComment = (threadId: string) => {
    if (!ydoc || !editable) return;
    const yArray = ydoc.getArray<CommentThread>("doc_comments");
    const arr = yArray.toArray();
    const index = arr.findIndex((c) => c.id === threadId);
    if (index === -1) return;

    ydoc.transact(() => {
      yArray.delete(index, 1);
    });
  };

  const handleAddReply = (threadId: string) => {
    const text = replyInputs[threadId]?.trim();
    if (!text || !ydoc || !editable) return;

    const yArray = ydoc.getArray<CommentThread>("doc_comments");
    const arr = yArray.toArray();
    const index = arr.findIndex((c) => c.id === threadId);
    if (index === -1) return;

    const thread = arr[index];
    const newReply: CommentReply = {
      id: crypto.randomUUID(),
      authorName: currentUser.name || "Anonymous",
      authorEmail: currentUser.email,
      content: text,
      createdAt: new Date().toISOString(),
    };

    const updated: CommentThread = {
      ...thread,
      replies: [...thread.replies, newReply],
    };

    ydoc.transact(() => {
      yArray.delete(index, 1);
      yArray.insert(index, [updated]);
    });

    setReplyInputs((prev) => ({ ...prev, [threadId]: "" }));
  };

  const activeComments = comments.filter((c) => !c.resolved);
  const resolvedComments = comments.filter((c) => c.resolved);
  const displayedComments = filter === "active" ? activeComments : resolvedComments;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-canvas-surface border-l border-border shadow-none flex flex-col selection:bg-sage-soft selection:text-ink">
      {/* Top Header */}
      <div className="px-4 py-3 border-b border-border bg-canvas-subtle flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-ink-muted" />
          <h3 className="font-mono text-xs font-bold uppercase text-ink tracking-wider">
            COMMENTS [{activeComments.length}]
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-ink-muted hover:text-ink hover:bg-canvas-neutral rounded-xs transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-border bg-canvas-surface shrink-0 font-mono text-xs">
        <button
          type="button"
          onClick={() => setFilter("active")}
          className={`flex-1 py-2 text-center border-b-2 font-medium transition-colors ${
            filter === "active"
              ? "border-sage text-ink font-bold bg-canvas-DEFAULT"
              : "border-transparent text-ink-secondary hover:text-ink hover:bg-canvas-subtle"
          }`}
        >
          ACTIVE ({activeComments.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("resolved")}
          className={`flex-1 py-2 text-center border-b-2 font-medium transition-colors ${
            filter === "resolved"
              ? "border-sage text-ink font-bold bg-canvas-DEFAULT"
              : "border-transparent text-ink-secondary hover:text-ink hover:bg-canvas-subtle"
          }`}
        >
          RESOLVED ({resolvedComments.length})
        </button>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayedComments.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <MessageSquare className="w-6 h-6 text-ink-muted mx-auto stroke-1" />
            <p className="font-mono text-xs text-ink-secondary">
              {filter === "active" ? "NO ACTIVE COMMENTS" : "NO RESOLVED COMMENTS"}
            </p>
            <p className="font-mono text-[11px] text-ink-muted">
              {filter === "active"
                ? "Add a comment below to start a collaborative thread."
                : "Resolved comment threads will appear here."}
            </p>
          </div>
        ) : (
          displayedComments.map((thread) => {
            const date = new Date(thread.createdAt);
            return (
              <div
                key={thread.id}
                className="border border-border bg-canvas-DEFAULT rounded-xs p-3 space-y-2.5"
              >
                {/* Thread Header */}
                <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <div className="w-5 h-5 rounded-xs bg-sage/20 border border-sage/40 flex items-center justify-center font-bold text-ink text-[10px]">
                      {thread.authorName.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bold text-ink truncate max-w-[120px]">
                      {thread.authorName}
                    </span>
                    <span className="text-ink-muted">&bull;</span>
                    <span className="text-ink-muted text-[10px]">
                      {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleResolve(thread.id)}
                      disabled={!editable}
                      title={thread.resolved ? "Reopen comment" : "Resolve comment"}
                      className="p-1 text-ink-muted hover:text-sage hover:bg-canvas-subtle rounded-xs transition-colors"
                    >
                      <CheckCircle
                        className={`w-3.5 h-3.5 ${
                          thread.resolved ? "text-status-success" : "text-ink-muted"
                        }`}
                      />
                    </button>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(thread.id)}
                        title="Delete thread"
                        className="p-1 text-ink-muted hover:text-status-danger hover:bg-canvas-subtle rounded-xs transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Comment Body */}
                <p className="text-xs text-ink leading-relaxed break-words">
                  {thread.content}
                </p>

                {/* Reply Threads */}
                {thread.replies.length > 0 && (
                  <div className="border-t border-border/60 pt-2 space-y-2 pl-2">
                    {thread.replies.map((reply) => (
                      <div key={reply.id} className="space-y-0.5 font-mono text-[11px]">
                        <div className="flex items-center gap-1.5 text-ink-muted">
                          <CornerDownRight className="w-3 h-3 text-ink-muted shrink-0" />
                          <span className="font-semibold text-ink">{reply.authorName}</span>
                          <span>&bull;</span>
                          <span className="text-[10px]">
                            {new Date(reply.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="pl-4 text-xs font-sans text-ink leading-relaxed break-words">
                          {reply.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply Input */}
                {!thread.resolved && editable && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="text"
                      value={replyInputs[thread.id] || ""}
                      onChange={(e) =>
                        setReplyInputs((prev) => ({
                          ...prev,
                          [thread.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddReply(thread.id);
                        }
                      }}
                      placeholder="Reply..."
                      className="flex-1 text-xs font-mono bg-canvas-subtle border border-border px-2 py-1 rounded-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-sage"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddReply(thread.id)}
                      className="p-1.5 bg-canvas-subtle hover:bg-canvas-neutral border border-border rounded-xs text-ink transition-colors"
                      title="Post reply"
                    >
                      <Send className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* New Comment Input Composer */}
      {editable && (
        <form
          onSubmit={handleAddComment}
          className="p-3 border-t border-border bg-canvas-subtle flex flex-col gap-2 shrink-0"
        >
          <textarea
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            placeholder="Add a collaborative comment..."
            rows={2}
            className="w-full text-xs font-sans bg-canvas-DEFAULT border border-border p-2 rounded-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-sage resize-none"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 font-mono text-[10px] text-status-success">
              <ShieldCheck className="w-3 h-3" />
              <span>E2EE synced via Yjs</span>
            </div>
            <button
              type="submit"
              disabled={!newCommentText.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-medium text-canvas-DEFAULT bg-sage hover:bg-sage-hover border border-sage rounded-xs transition-colors disabled:opacity-50"
            >
              <Send className="w-3 h-3" />
              <span>POST</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
