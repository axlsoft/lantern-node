import Fastify from "fastify";
import { lanternPlugin } from "@lantern/telemetry-fastify";

const app = Fastify({ logger: true });

await app.register(lanternPlugin, {
  collectorEndpoint: process.env["LANTERN_COLLECTOR_ENDPOINT"] ?? "http://localhost:8080",
  apiKey: process.env["LANTERN_API_KEY"] ?? "dev-key",
  projectId: process.env["LANTERN_PROJECT_ID"] ?? "00000000-0000-0000-0000-000000000000",
});

app.get("/greet", async () => {
  return { message: "hello from fastify-app" };
});

app.get<{ Querystring: { a?: string; b?: string } }>("/add", async (request) => {
  const a = Number(request.query.a ?? 0);
  const b = Number(request.query.b ?? 0);
  return { result: a + b };
});

const port = Number(process.env["PORT"] ?? 3001);
await app.listen({ port });
