export type LeadPayload = {
  email: string;
  name?: string;
  company?: string;
  jobId?: string;
  source: string;
};

export type LeadNotificationStatus = "sent" | "failed" | "unknown";

export type LeadSubmissionResult = {
  persisted: true;
  notifications: {
    admin: LeadNotificationStatus;
    confirmation: LeadNotificationStatus;
  };
};

type TrackLead = (
  event: "migration_lead_submitted",
  properties: { source: string; hasJob: boolean },
) => void;

export class LeadSubmissionError extends Error {
  constructor() {
    super("We could not submit the form. Please try again.");
    this.name = "LeadSubmissionError";
  }
}

function status(value: unknown): LeadNotificationStatus {
  return value === "sent" || value === "failed" ? value : "unknown";
}

export async function submitLead(input: {
  apiUrl: string;
  payload: LeadPayload;
  fetchImpl?: typeof fetch;
  track: TrackLead;
}): Promise<LeadSubmissionResult> {
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(`${input.apiUrl}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.payload),
    });
  } catch {
    throw new LeadSubmissionError();
  }

  if (!response.ok) throw new LeadSubmissionError();

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LeadSubmissionError();
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !("ok" in payload) ||
    payload.ok !== true
  ) {
    throw new LeadSubmissionError();
  }

  const notifications =
    "notifications" in payload &&
    payload.notifications &&
    typeof payload.notifications === "object"
      ? payload.notifications
      : {};

  input.track("migration_lead_submitted", {
    source: input.payload.source,
    hasJob: Boolean(input.payload.jobId),
  });

  return {
    persisted: true,
    notifications: {
      admin: "admin" in notifications ? status(notifications.admin) : "unknown",
      confirmation:
        "confirmation" in notifications
          ? status(notifications.confirmation)
          : "unknown",
    },
  };
}
