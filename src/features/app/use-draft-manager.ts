import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type DragEventHandler,
  type SetStateAction
} from "react";
import { removeAttachmentById, summarizeBlockedAttachmentMessages } from "./controller-helpers";
import { buildDraftAttachments, type DraftAttachment } from "./draft-attachments";
import {
  createId,
  hasAttachmentPayload,
  revokeAttachmentPreview
} from "../chat/utils/chat-utils";
import type { ModelCapabilities, ChatAttachment } from "../../shared/contracts";
import type { AppView } from "./use-app-ui-state";

type UseDraftManagerParams = {
  activeView: AppView;
  modelId: string;
  modelCapabilities: ModelCapabilities;
  setErrorBanner: Dispatch<SetStateAction<string | null>>;
  setAgentErrorBanner: Dispatch<SetStateAction<string | null>>;
};

const toDraftFiles = (files: FileList | File[] | null) => {
  if (!files) {
    return [];
  }
  return Array.from(files).filter((file) => file instanceof File);
};

export const useDraftManager = ({
  activeView,
  modelId,
  modelCapabilities,
  setErrorBanner,
  setAgentErrorBanner
}: UseDraftManagerParams) => {
  const [draft, setDraft] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
  const [agentDraft, setAgentDraft] = useState("");
  const [agentDraftAttachments, setAgentDraftAttachments] = useState<DraftAttachment[]>([]);
  const [isChatDragOver, setIsChatDragOver] = useState(false);

  const draftAttachmentsRef = useRef<DraftAttachment[]>([]);
  const agentDraftAttachmentsRef = useRef<DraftAttachment[]>([]);
  const chatDropDepthRef = useRef(0);
  const isChatDragOverRef = useRef(false);

  const updateChatDragOver = (next: boolean) => {
    if (isChatDragOverRef.current === next) {
      return;
    }
    isChatDragOverRef.current = next;
    setIsChatDragOver(next);
  };

  const clearDraftAttachments = () => {
    setDraftAttachments((previous) => {
      previous.forEach(revokeAttachmentPreview);
      return [];
    });
  };

  const clearAgentDraftAttachments = () => {
    setAgentDraftAttachments((previous) => {
      previous.forEach(revokeAttachmentPreview);
      return [];
    });
  };

  const toChatAttachments = (attachments: DraftAttachment[]): ChatAttachment[] =>
    attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      kind: attachment.kind,
      textContent: attachment.kind === "text" ? attachment.textContent : undefined,
      imageDataUrl: attachment.kind === "image" ? attachment.imageDataUrl : undefined
    }));

  const addDraftLikeFiles = (
    files: FileList | File[] | null,
    onBlockedMessage: (message: string) => void,
    onAccepted: (accepted: DraftAttachment[]) => void
  ) => {
    const incomingFiles = toDraftFiles(files);
    if (!incomingFiles.length) {
      return;
    }

    void (async () => {
      const { accepted, blockedMessages } = await buildDraftAttachments({
        files: incomingFiles,
        createId,
        modelId,
        modelCapabilities
      });

      const blockedSummary = summarizeBlockedAttachmentMessages(blockedMessages);
      if (blockedSummary) {
        onBlockedMessage(blockedSummary);
      }

      if (!accepted.length) {
        return;
      }
      onAccepted(accepted);
    })();
  };

  const addFiles = (files: FileList | File[] | null) => {
    addDraftLikeFiles(
      files,
      (message) => setErrorBanner(message),
      (accepted) => setDraftAttachments((previous) => [...previous, ...accepted])
    );
  };

  const addAgentFiles = (files: FileList | File[] | null) => {
    addDraftLikeFiles(
      files,
      (message) => setAgentErrorBanner(message),
      (accepted) => setAgentDraftAttachments((previous) => [...previous, ...accepted])
    );
  };

  const removeAttachment = (attachmentId: string) => {
    setDraftAttachments((previous) => {
      const { removed, next } = removeAttachmentById(previous, attachmentId);
      if (removed) {
        revokeAttachmentPreview(removed);
      }
      return next;
    });
  };

  const removeAgentAttachment = (attachmentId: string) => {
    setAgentDraftAttachments((previous) => {
      const { removed, next } = removeAttachmentById(previous, attachmentId);
      if (removed) {
        revokeAttachmentPreview(removed);
      }
      return next;
    });
  };

  const hasFileTransfer = (dataTransfer: DataTransfer | null) =>
    Boolean(dataTransfer && Array.from(dataTransfer.types).includes("Files"));

  const handleChatDragEnter: DragEventHandler<HTMLElement> = (event) => {
    if (activeView !== "chat" || !hasFileTransfer(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    chatDropDepthRef.current += 1;
    updateChatDragOver(true);
  };

  const handleChatDragOver: DragEventHandler<HTMLElement> = (event) => {
    if (activeView !== "chat" || !hasFileTransfer(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    updateChatDragOver(true);
  };

  const handleChatDragLeave: DragEventHandler<HTMLElement> = (event) => {
    if (activeView !== "chat" || !hasFileTransfer(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    chatDropDepthRef.current = Math.max(0, chatDropDepthRef.current - 1);
    if (chatDropDepthRef.current === 0) {
      updateChatDragOver(false);
    }
  };

  const handleChatDrop: DragEventHandler<HTMLElement> = (event) => {
    if (activeView !== "chat" || !hasFileTransfer(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    chatDropDepthRef.current = 0;
    updateChatDragOver(false);
    addFiles(event.dataTransfer.files);
  };

  useEffect(() => {
    draftAttachmentsRef.current = draftAttachments;
  }, [draftAttachments]);

  useEffect(() => {
    agentDraftAttachmentsRef.current = agentDraftAttachments;
  }, [agentDraftAttachments]);

  useEffect(() => {
    if (activeView !== "chat") {
      chatDropDepthRef.current = 0;
      updateChatDragOver(false);
    }
  }, [activeView]);

  useEffect(() => {
    const resetDragState = () => {
      chatDropDepthRef.current = 0;
      updateChatDragOver(false);
    };

    window.addEventListener("dragend", resetDragState);
    window.addEventListener("drop", resetDragState);
    return () => {
      window.removeEventListener("dragend", resetDragState);
      window.removeEventListener("drop", resetDragState);
      draftAttachmentsRef.current.forEach(revokeAttachmentPreview);
      agentDraftAttachmentsRef.current.forEach(revokeAttachmentPreview);
    };
  }, []);

  return {
    draft,
    setDraft,
    draftAttachments,
    clearDraftAttachments,
    addFiles,
    removeAttachment,
    toChatAttachments,
    agentDraft,
    setAgentDraft,
    agentDraftAttachments,
    clearAgentDraftAttachments,
    addAgentFiles,
    removeAgentAttachment,
    isChatDragOver,
    handleChatDragEnter,
    handleChatDragOver,
    handleChatDragLeave,
    handleChatDrop,
    hasAttachmentPayload
  };
};
