export type TrackedUserMessage = {
  id: string;
  sessionId: string;
  content: string;
  createdAt: string;
};

export const trimBlock = (value: string) => value.replace(/\r\n/g, "\n").trim();

type MessageCursor = Pick<TrackedUserMessage, "createdAt" | "id">;

export const compareMessageCursor = <
  TLeft extends MessageCursor,
  TRight extends MessageCursor
>(
  left: TLeft,
  right: TRight
) => {
  if (left.createdAt === right.createdAt) {
    return left.id.localeCompare(right.id);
  }
  return left.createdAt.localeCompare(right.createdAt);
};

export const getDateStringForTimeZone = (date: Date, timeZone?: string): string => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Unable to format date parts.");
  }

  return `${year}-${month}-${day}`;
};
