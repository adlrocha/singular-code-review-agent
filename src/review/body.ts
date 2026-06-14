import {
  type ReviewInlineComment,
  type ReviewPayload,
  type ReviewPayloadComment,
  type ValidatedReviewQueue,
} from "./types.js";

const MAX_REVIEW_BODY_LENGTH = 6_000;

export function modelLabel(modelId: string): string {
  return modelId.split("/").filter(Boolean).pop() || modelId || "unknown";
}

export function applyReviewBanner(body: string, modelId: string): string {
  const trimmed = body.trim();
  const banner = `> reviewer · ${modelLabel(modelId)}`;
  return trimmed ? `${banner}\n\n${trimmed}` : banner;
}

export function enforceReviewBodyLimit(body: string, maxLength = MAX_REVIEW_BODY_LENGTH): string {
  if (body.length <= maxLength) {
    return body;
  }

  return `${body.slice(0, maxLength).trimEnd()}\n\n[Review body truncated]`;
}

export function toReviewPayloadComment(comment: ReviewInlineComment): ReviewPayloadComment {
  const payload: ReviewPayloadComment = {
    path: comment.path,
    line: comment.line,
    side: comment.side,
    body: comment.body,
  };

  if (comment.start_line !== undefined) {
    payload.start_line = comment.start_line;
    payload.start_side = comment.start_side || comment.side;
  }

  return payload;
}

export function buildReviewPayload(validated: ValidatedReviewQueue): ReviewPayload {
  return {
    body: validated.conclusion?.trim() || "Singular Code Review completed.",
    event: "COMMENT",
    comments: validated.inlineComments.map(toReviewPayloadComment),
  };
}
