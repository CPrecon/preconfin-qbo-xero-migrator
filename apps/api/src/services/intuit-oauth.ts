import type { AppEnv } from "../env.js";

export interface IntuitTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
  tokenType: string;
  scope: string;
  realmId: string;
}

export class IntuitOAuthError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly errorCode?: string,
  ) {
    super(message);
    this.name = "IntuitOAuthError";
  }
}

export class IntuitOAuthClient {
  constructor(private readonly env: AppEnv) {}

  authorizationUrl(state: string, codeChallenge: string): string {
    const url = new URL("https://appcenter.intuit.com/connect/oauth2");
    url.searchParams.set("client_id", this.env.INTUIT_CLIENT_ID);
    url.searchParams.set("redirect_uri", this.env.INTUIT_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "com.intuit.quickbooks.accounting");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  async exchangeCode(
    code: string,
    realmId: string,
    codeVerifier: string,
  ): Promise<IntuitTokens> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.env.INTUIT_REDIRECT_URI,
      code_verifier: codeVerifier,
    });
    return this.tokenRequest(body, realmId);
  }

  async refresh(refreshToken: string, realmId: string): Promise<IntuitTokens> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    return this.tokenRequest(body, realmId);
  }

  async revoke(token: string): Promise<void> {
    const auth = Buffer.from(
      `${this.env.INTUIT_CLIENT_ID}:${this.env.INTUIT_CLIENT_SECRET}`,
    ).toString("base64");
    const response = await fetch(
      "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      },
    );
    if (!response.ok)
      throw new IntuitOAuthError(
        "Intuit token revocation failed",
        response.status,
      );
  }

  private async tokenRequest(
    body: URLSearchParams,
    realmId: string,
  ): Promise<IntuitTokens> {
    const auth = Buffer.from(
      `${this.env.INTUIT_CLIENT_ID}:${this.env.INTUIT_CLIENT_SECRET}`,
    ).toString("base64");
    const response = await fetch(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    if (!response.ok) {
      let errorCode: string | undefined;
      try {
        const json = (await response.json()) as { error?: string };
        errorCode = json.error;
      } catch {
        errorCode = undefined;
      }
      throw new IntuitOAuthError(
        "Intuit token request failed",
        response.status,
        errorCode,
      );
    }
    const json = (await response.json()) as any;
    const now = Date.now();
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(
        now + Number(json.expires_in ?? 3600) * 1000,
      ).toISOString(),
      refreshExpiresAt: new Date(
        now + Number(json.x_refresh_token_expires_in ?? 8726400) * 1000,
      ).toISOString(),
      tokenType: json.token_type ?? "bearer",
      scope: json.scope ?? "com.intuit.quickbooks.accounting",
      realmId,
    };
  }
}
