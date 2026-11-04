"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { ComputerTerminal01Icon } from "@/components/animate-ui/icons/hugeicons/computer-terminal-01";
import { Copy01Icon } from "@/components/animate-ui/icons/hugeicons/copy-01";
import { CheckIcon } from "@/components/animate-ui/icons/hugeicons/check";
import { Search01Icon } from "@/components/animate-ui/icons/hugeicons/search-01";
import { ClapperboardIcon } from "@/components/animate-ui/icons/hugeicons/clapperboard";
import { UsersIcon } from "@/components/animate-ui/icons/hugeicons/users";
import { WorkflowIcon } from "@/components/animate-ui/icons/hugeicons/workflow";
import { SendHorizontalIcon } from "@/components/animate-ui/icons/hugeicons/send-horizontal";
import { Download01Icon } from "@/components/animate-ui/icons/hugeicons/download-01";

type CodeLang = "curl" | "typescript" | "python";
type EndpointTab = "search" | "clips" | "entities" | "webhooks";

const API_ENDPOINTS: Record<
  EndpointTab,
  {
    title: string;
    method: "POST" | "GET";
    path: string;
    description: string;
    curl: string;
    typescript: string;
    python: string;
  }
> = {
  search: {
    title: "Multimodal Video Search",
    method: "POST",
    path: "/api/v1/search",
    description:
      "Search across all indexed media using natural language prompts, spoken dialogue transcripts, visual OCR, and face appearances.",
    curl: `curl -X POST https://api.brisky.dev/v1/search \\
  -H "Authorization: Bearer brk_live_94f28ae92d..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "Sarah laughed at the camera setup",
    "spaces": ["space_northwind_q4"],
    "modalities": ["visual", "speech", "cross-modal"],
    "limit": 5,
    "min_confidence": 0.85
  }'`,
    typescript: `import { BriskyClient } from "@brisky/sdk";

const brisky = new BriskyClient({
  apiKey: process.env.BRISKY_API_KEY,
});

const results = await brisky.search({
  query: "Sarah laughed at the camera setup",
  spaces: ["space_northwind_q4"],
  modalities: ["visual", "speech", "cross-modal"],
  limit: 5,
  minConfidence: 0.85,
});

for (const moment of results.moments) {
  console.log(\`Found moment at \${moment.startTime}s - \${moment.description}\`);
}`,
    python: `from brisky import Brisky

client = Brisky(api_key="brk_live_94f28ae92d...")

response = client.search(
    query="Sarah laughed at the camera setup",
    spaces=["space_northwind_q4"],
    modalities=["visual", "speech", "cross-modal"],
    limit=5,
    min_confidence=0.85,
)

for moment in response.moments:
    print(f"[{moment.start_time:.2f}s - {moment.end_time:.2f}s] {moment.quote}")`,
  },
  clips: {
    title: "Frame-Accurate Clip Extraction",
    method: "POST",
    path: "/api/v1/clips/extract",
    description:
      "Extract lossless or transcoded video clips with frame precision and synchronized multi-track audio.",
    curl: `curl -X POST https://api.brisky.dev/v1/clips/extract \\
  -H "Authorization: Bearer brk_live_94f28ae92d..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "videoId": "vid_2026_q4_townhall",
    "startTime": 48.25,
    "endTime": 62.10,
    "format": "mp4",
    "burnSubtitles": true
  }'`,
    typescript: `import { BriskyClient } from "@brisky/sdk";

const brisky = new BriskyClient();

const clip = await brisky.clips.extract({
  videoId: "vid_2026_q4_townhall",
  startTime: 48.25,
  endTime: 62.10,
  format: "mp4",
  burnSubtitles: true,
});

console.log("Download clip URL:", clip.downloadUrl);`,
    python: `from brisky import Brisky

client = Brisky()

clip = client.clips.extract(
    video_id="vid_2026_q4_townhall",
    start_time=48.25,
    end_time=62.10,
    format="mp4",
    burn_subtitles=True,
)

print(f"Clip generated: {clip.download_url}")`,
  },
  entities: {
    title: "Face & Entity Grounding",
    method: "POST",
    path: "/api/v1/entities/match",
    description:
      "Identify enrolled team members and speakers across hours of raw unedited footage using Brisky face vectors.",
    curl: `curl -X POST https://api.brisky.dev/v1/entities/match \\
  -H "Authorization: Bearer brk_live_94f28ae92d..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "entityId": "ent_sarah_chen",
    "mediaIds": ["vid_2026_q4_townhall"],
    "clusterThreshold": 0.92
  }'`,
    typescript: `import { BriskyClient } from "@brisky/sdk";

const brisky = new BriskyClient();

const appearances = await brisky.entities.match({
  entityId: "ent_sarah_chen",
  mediaIds: ["vid_2026_q4_townhall"],
  clusterThreshold: 0.92,
});

console.log(\`Matched \${appearances.length} scenes with Sarah Chen\`);`,
    python: `from brisky import Brisky

client = Brisky()

appearances = client.entities.match(
    entity_id="ent_sarah_chen",
    media_ids=["vid_2026_q4_townhall"],
    cluster_threshold=0.92,
)

print(f"Matched {len(appearances)} appearances.")`,
  },
  webhooks: {
    title: "Webhook Event Subscriptions",
    method: "POST",
    path: "/api/v1/webhooks/subscribe",
    description:
      "Receive real-time signed HTTP callbacks when video ingestion completes, moments are indexed, or exports finish.",
    curl: `curl -X POST https://api.brisky.dev/v1/webhooks/subscribe \\
  -H "Authorization: Bearer brk_live_94f28ae92d..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "targetUrl": "https://myapp.com/api/brisky-events",
    "events": ["video.indexed", "moment.detected", "export.ready"]
  }'`,
    typescript: `import { BriskyClient } from "@brisky/sdk";

const brisky = new BriskyClient();

await brisky.webhooks.create({
  targetUrl: "https://myapp.com/api/brisky-events",
  events: ["video.indexed", "moment.detected", "export.ready"],
});`,
    python: `from brisky import Brisky

client = Brisky()

client.webhooks.create(
    target_url="https://myapp.com/api/brisky-events",
    events=["video.indexed", "moment.detected", "export.ready"],
)`,
  },
};

export function DeveloperView() {
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [activeTab, setActiveTab] = useState<EndpointTab>("search");
  const [selectedLang, setSelectedLang] = useState<CodeLang>("typescript");
  const [testWebhookStatus, setTestWebhookStatus] = useState<"idle" | "sending" | "success">("idle");

  const fullKey = "brk_live_94f28ae92da3b0183cd04918e93aa201";
  const maskedKey = "brk_live_94f28ae••••••••••••••••••••••••••••";

  const handleCopyKey = () => {
    navigator.clipboard.writeText(fullKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopySnippet = () => {
    const code = API_ENDPOINTS[activeTab][selectedLang];
    navigator.clipboard.writeText(code);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleTestWebhook = () => {
    setTestWebhookStatus("sending");
    setTimeout(() => {
      setTestWebhookStatus("success");
      setTimeout(() => setTestWebhookStatus("idle"), 3000);
    }, 900);
  };

  return (
    <div className="relative min-h-dvh bg-brand-canvas px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-violet/10 px-3 py-1 text-xs font-semibold text-brand-violet">
              <ComputerTerminal01Icon size={14} />
              <span>Brisky Engine v2.4 API</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-brand-ink sm:text-3xl">
              Developer Portal
            </h1>
            <p className="mt-1 text-sm text-brand-muted">
              Integrate Brisky&apos;s multimodal media intelligence, neural semantic search, and moment extraction into your applications.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold text-brand-ink">API Operational</span>
            <span className="text-xs text-brand-muted">(99.98% uptime)</span>
          </div>
        </div>

        {/* API Credentials Card */}
        <div className="rounded-3xl border border-brand-line/70 bg-brand-surface p-6 shadow-xs sm:p-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-semibold text-brand-ink">Live API Secret Key</h2>
              <p className="text-xs text-brand-muted">
                Use this key to authenticate server-side requests. Keep it secret and never expose it in public clients.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setApiKeyVisible(!apiKeyVisible)}
              className="text-xs font-semibold text-brand-violet hover:underline"
            >
              {apiKeyVisible ? "Hide key" : "Reveal key"}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 rounded-2xl border border-brand-line/80 bg-brand-canvas px-4 py-3 font-mono text-xs text-brand-ink">
              {apiKeyVisible ? fullKey : maskedKey}
            </div>

            <AnimateIcon animateOnHover asChild>
              <button
                type="button"
                onClick={handleCopyKey}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-action px-5 py-3 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-action-hover"
              >
                {copiedKey ? (
                  <>
                    <CheckIcon size={15} />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy01Icon size={15} />
                    <span>Copy API Key</span>
                  </>
                )}
              </button>
            </AnimateIcon>
          </div>

          {/* Usage Metrics Strip */}
          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-brand-line/60 pt-5 sm:grid-cols-3">
            <div>
              <p className="text-xs text-brand-muted">Monthly Rate Limit</p>
              <p className="mt-1 text-sm font-semibold text-brand-ink">10,000 requests / mo</p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-brand-canvas">
                <div className="h-full w-[24%] rounded-full bg-brand-action" />
              </div>
            </div>
            <div>
              <p className="text-xs text-brand-muted">Rate Limiting Window</p>
              <p className="mt-1 text-sm font-semibold text-brand-ink">100 requests / minute</p>
              <p className="mt-1 text-[11px] text-emerald-600 font-medium">Standard tier active</p>
            </div>
            <div>
              <p className="text-xs text-brand-muted">Active Webhook Endpoints</p>
              <p className="mt-1 text-sm font-semibold text-brand-ink">1 endpoint verified</p>
              <p className="mt-1 text-[11px] text-brand-muted">Last ping 2m ago</p>
            </div>
          </div>
        </div>

        {/* Interactive API Explorer */}
        <div className="rounded-3xl border border-brand-line/70 bg-brand-surface p-6 shadow-xs sm:p-7">
          <div className="flex flex-col justify-between gap-3 border-b border-brand-line/60 pb-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-semibold text-brand-ink">API Endpoints & Code Generator</h2>
              <p className="text-xs text-brand-muted">
                Explore Brisky API endpoints and copy pre-configured SDK snippets for your stack.
              </p>
            </div>

            {/* Language Selector */}
            <div className="inline-flex rounded-xl bg-brand-canvas p-1">
              {(["typescript", "python", "curl"] as CodeLang[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setSelectedLang(lang)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition ${
                    selectedLang === lang
                      ? "bg-brand-surface text-brand-violet shadow-2xs"
                      : "text-brand-muted hover:text-brand-ink"
                  }`}
                >
                  {lang === "curl" ? "cURL" : lang}
                </button>
              ))}
            </div>
          </div>

          {/* Endpoint Selector Tabs */}
          <div className="mt-5 flex flex-wrap gap-2">
            {(
              [
                { id: "search", label: "Search Media", Icon: Search01Icon },
                { id: "clips", label: "Extract Clips", Icon: ClapperboardIcon },
                { id: "entities", label: "Entity Grounding", Icon: UsersIcon },
                { id: "webhooks", label: "Webhooks", Icon: WorkflowIcon },
              ] as const
            ).map((tab) => (
              <AnimateIcon key={tab.id} animateOnHover asChild>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                    activeTab === tab.id
                      ? "bg-brand-action text-white shadow-2xs"
                      : "bg-brand-canvas text-brand-muted hover:bg-brand-line/50 hover:text-brand-ink"
                  }`}
                >
                  <tab.Icon size={15} />
                  <span>{tab.label}</span>
                </button>
              </AnimateIcon>
            ))}
          </div>

          {/* Tab Content Info */}
          <div className="mt-4 rounded-2xl bg-brand-canvas/70 p-4">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-brand-violet/10 px-2 py-0.5 font-mono text-[11px] font-bold text-brand-violet">
                {API_ENDPOINTS[activeTab].method}
              </span>
              <span className="font-mono text-xs font-semibold text-brand-ink">
                {API_ENDPOINTS[activeTab].path}
              </span>
            </div>
            <p className="mt-1 text-xs text-brand-muted">
              {API_ENDPOINTS[activeTab].description}
            </p>
          </div>

          {/* Code Viewer Box */}
          <div className="relative mt-4 overflow-hidden rounded-2xl bg-[#1e2235] text-slate-100 shadow-md">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-xs text-slate-400">
              <span className="font-mono">{selectedLang === "curl" ? "Terminal (bash)" : `${selectedLang} snippet`}</span>
              <AnimateIcon animateOnHover asChild><button
                type="button"
                onClick={handleCopySnippet}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-brand-surface/10 hover:text-white"
              >
                {copiedSnippet ? (
                  <>
                    <CheckIcon size={13} className="text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy01Icon size={13} />
                    <span>Copy Snippet</span>
                  </>
                )}
              </button></AnimateIcon>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-200">
              <code>{API_ENDPOINTS[activeTab][selectedLang]}</code>
            </pre>
          </div>
        </div>

        {/* Webhooks & SDKs Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Webhooks Box */}
          <div className="rounded-3xl border border-brand-line/70 bg-brand-surface p-6 shadow-xs">
            <div className="flex items-center gap-2">
              <SendHorizontalIcon size={18} className="text-brand-violet" />
              <h3 className="text-base font-semibold text-brand-ink">Webhook Receiver</h3>
            </div>
            <p className="mt-1 text-xs text-brand-muted">
              Dispatch real-time callbacks to your webhook URL whenever high-resolution clips or transcripts are generated.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-brand-ink">Payload Target URL</label>
                <input
                  type="text"
                  defaultValue="https://api.yourdomain.com/webhooks/brisky"
                  className="mt-1 w-full rounded-xl border border-brand-line bg-brand-canvas px-3.5 py-2 font-mono text-xs text-brand-ink outline-none transition focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-brand-ink">Subscribed Event Triggers</label>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs text-brand-muted">
                  <label className="flex items-center gap-2 rounded-lg border border-brand-line/60 bg-brand-canvas px-2.5 py-1.5">
                    <input type="checkbox" defaultChecked className="rounded text-brand-violet focus:ring-brand-violet" />
                    <span>video.indexed</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-brand-line/60 bg-brand-canvas px-2.5 py-1.5">
                    <input type="checkbox" defaultChecked className="rounded text-brand-violet focus:ring-brand-violet" />
                    <span>moment.detected</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-brand-line/60 bg-brand-canvas px-2.5 py-1.5">
                    <input type="checkbox" defaultChecked className="rounded text-brand-violet focus:ring-brand-violet" />
                    <span>face.matched</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-brand-line/60 bg-brand-canvas px-2.5 py-1.5">
                    <input type="checkbox" defaultChecked className="rounded text-brand-violet focus:ring-brand-violet" />
                    <span>export.ready</span>
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestWebhook}
                  disabled={testWebhookStatus !== "idle"}
                  className="w-full rounded-xl border border-brand-line bg-brand-canvas py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-line/50 disabled:opacity-60"
                >
                  {testWebhookStatus === "sending"
                    ? "Sending ping payload..."
                    : testWebhookStatus === "success"
                    ? "✓ Test ping received (HTTP 200 OK)"
                    : "Send Test Webhook Ping"}
                </button>
              </div>
            </div>
          </div>

          {/* Official SDKs & Specification */}
          <div className="rounded-3xl border border-brand-line/70 bg-brand-surface p-6 shadow-xs">
            <div className="flex items-center gap-2">
              <Download01Icon size={18} className="text-brand-violet" />
              <h3 className="text-base font-semibold text-brand-ink">Official SDKs & Specs</h3>
            </div>
            <p className="mt-1 text-xs text-brand-muted">
              Pre-built client libraries for TypeScript/Node.js and Python with built-in retry handling and typings.
            </p>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-brand-line/60 bg-brand-canvas p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-brand-ink">TypeScript SDK</span>
                  <span className="rounded bg-brand-violet/10 px-2 py-0.5 text-[10px] font-semibold text-brand-violet">
                    npm v2.4.1
                  </span>
                </div>
                <pre className="mt-2 rounded-lg bg-brand-surface px-3 py-1.5 font-mono text-[11px] text-brand-ink">
                  npm install @brisky/sdk
                </pre>
              </div>

              <div className="rounded-2xl border border-brand-line/60 bg-brand-canvas p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-brand-ink">Python Client</span>
                  <span className="rounded bg-brand-violet/10 px-2 py-0.5 text-[10px] font-semibold text-brand-violet">
                    pip v2.4.0
                  </span>
                </div>
                <pre className="mt-2 rounded-lg bg-brand-surface px-3 py-1.5 font-mono text-[11px] text-brand-ink">
                  pip install brisky
                </pre>
              </div>

              <div className="rounded-2xl border border-brand-line/60 bg-brand-canvas p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-brand-ink">OpenAPI 3.1 Specification</span>
                  <a
                    href="#download"
                    onClick={(e) => {
                      e.preventDefault();
                      alert("OpenAPI 3.1 Schema specification downloaded (brisky-spec.json)");
                    }}
                    className="text-[11px] font-semibold text-brand-violet hover:underline"
                  >
                    Download JSON
                  </a>
                </div>
                <p className="mt-1 text-[11px] text-brand-muted">
                  Generate custom clients for Go, Rust, or Java directly from our schema.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
