import { GoogleAuth } from "google-auth-library";
import { logger } from "./logger.js";

let googleAuth: GoogleAuth | null = null;

function getGoogleAuth(): GoogleAuth {
  if (!googleAuth) {
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!keyJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");

    const credentials = JSON.parse(keyJson);
    googleAuth = new GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/indexing",
        "https://www.googleapis.com/auth/webmasters",
      ],
    });
  }
  return googleAuth;
}

export async function getGoogleAccessToken(): Promise<string> {
  try {
    const auth = getGoogleAuth();
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) throw new Error("Failed to get Google access token");
    return token.token;
  } catch (err) {
    logger.error({ err }, "Google auth token error");
    throw err;
  }
}
