/**
 * Phase 13 Post-M5 E2E — authenticated HTTP client for the isolated server.
 *
 * Talks only to the loopback acceptance server. Sessions are real NextAuth
 * credential sessions for synthetic users seeded in the disposable database.
 */
import { BASE_URL } from "./env";
import type { SyntheticActor } from "./seed";

type Cookie = { name: string; value: string };

export class HttpClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly label: string) {}

  private cookieHeader(): string {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  private absorb(response: Response): void {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const entry of raw) {
      const [pair] = entry.split(";");
      const index = pair.indexOf("=");
      if (index > 0) {
        this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
      }
    }
  }

  async request(
    method: string,
    path: string,
    options: { body?: unknown; form?: URLSearchParams; redirect?: RequestRedirect } = {}
  ): Promise<{ status: number; json: unknown; text: string; headers: Headers }> {
    const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    const headers: Record<string, string> = {};
    const cookie = this.cookieHeader();
    if (cookie) {
      headers.cookie = cookie;
    }
    let payload: string | undefined;
    if (options.form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      payload = options.form.toString();
    } else if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(options.body);
    }
    const response = await fetch(url, {
      body: payload,
      headers,
      method,
      redirect: options.redirect ?? "manual",
    });
    this.absorb(response);
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { headers: response.headers, json, status: response.status, text };
  }

  /** Real NextAuth credential sign-in for a synthetic user. */
  async login(actor: SyntheticActor): Promise<void> {
    const csrf = await this.request("GET", "/api/auth/csrf");
    if (csrf.status !== 200) {
      throw new Error(`${this.label}: csrf unavailable (${csrf.status})`);
    }
    const token = (csrf.json as { csrfToken?: string } | null)?.csrfToken;
    if (!token) {
      throw new Error(`${this.label}: csrf token missing`);
    }
    const form = new URLSearchParams({
      callbackUrl: `${BASE_URL}/ai-workspace`,
      csrfToken: token,
      email: actor.email,
      json: "true",
      password: actor.password,
    });
    const result = await this.request("POST", "/api/auth/callback/credentials", {
      form,
    });
    if (result.status >= 400) {
      throw new Error(`${this.label}: login rejected (${result.status})`);
    }
    const session = await this.request("GET", "/api/auth/session");
    const user = (session.json as { user?: { id?: string } } | null)?.user;
    if (!user?.id) {
      throw new Error(`${this.label}: session not established`);
    }
  }
}

export type ApiResult = {
  readonly status: number;
  readonly body: Record<string, unknown> | null;
  readonly text: string;
};

export function toApiResult(result: {
  status: number;
  json: unknown;
  text: string;
}): ApiResult {
  return {
    body: (result.json as Record<string, unknown> | null) ?? null,
    status: result.status,
    text: result.text,
  };
}

export async function clientFor(actor: SyntheticActor): Promise<HttpClient> {
  const client = new HttpClient(actor.email);
  await client.login(actor);
  return client;
}
