import express from "express";
import { LanternSDK } from "@lantern/telemetry";
import { lantern } from "@lantern/telemetry-express";

const sdk = new LanternSDK({
  collectorEndpoint: process.env["LANTERN_COLLECTOR_ENDPOINT"] ?? "http://localhost:8080",
  apiKey: process.env["LANTERN_API_KEY"] ?? "dev-key",
  projectId: process.env["LANTERN_PROJECT_ID"] ?? "00000000-0000-0000-0000-000000000000",
});

const app = express();
app.use(express.json());
app.use(lantern(sdk));

app.get("/greet", (_req, res) => {
  res.json({ message: "hello from express-app" });
});

app.get("/add", (req, res) => {
  const a = Number(req.query["a"] ?? 0);
  const b = Number(req.query["b"] ?? 0);
  res.json({ result: a + b });
});

const port = Number(process.env["PORT"] ?? 3000);
sdk
  .start()
  .then(() => {
    app.listen(port, () => {
      console.log(`express-app listening on :${port}`);
    });
  })
  .catch(console.error);
