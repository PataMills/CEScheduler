import { WebClient } from "@slack/web-api";

export const slack = process.env.SLACK_BOT_TOKEN
  ? new WebClient(process.env.SLACK_BOT_TOKEN)
  : null;

export const SLACK_CHANNEL = process.env.SLACK_CHANNEL || "#ops-status";
export const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
