import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";

let appPromise: ReturnType<typeof buildServer> | undefined;

async function app(envBindings: Record<string, string | undefined>) {
  if (!appPromise) appPromise = buildServer(loadEnv({ ...process.env, ...envBindings }));
  return appPromise;
}

export default {
  async fetch(request: Request, env: Record<string, string | undefined>): Promise<Response> {
    const fastify = await app(env);
    const url = new URL(request.url);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => { headers[key] = value; });
    const payload = ["GET", "HEAD"].includes(request.method) ? undefined : Buffer.from(await request.arrayBuffer());
    const response: any = await fastify.inject({ method: request.method, url: `${url.pathname}${url.search}`, headers, payload } as any);
    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(response.headers as Record<string, string | string[]>)) {
      if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(key, item));
      else if (value !== undefined) responseHeaders.set(key, String(value));
    }
    return new Response(response.body, { status: response.statusCode, headers: responseHeaders });
  }
};
