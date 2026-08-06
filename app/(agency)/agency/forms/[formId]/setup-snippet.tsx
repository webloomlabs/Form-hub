"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative">
      <pre className="max-h-[420px] overflow-auto rounded-md border bg-muted/50 p-4 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute right-2 top-2"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function SetupSnippet({
  endpoint,
  honeypotField,
}: {
  endpoint: string;
  honeypotField: string;
}) {
  const html = `<form action="${endpoint}" method="POST">
  <label>Name  <input type="text"  name="name"    required></label>
  <label>Email <input type="email" name="email"   required></label>
  <label>Message <textarea name="message" required></textarea></label>

  <!-- Spam trap: must stay empty and stay hidden from real users. -->
  <input type="text" name="${honeypotField}" tabindex="-1" autocomplete="off"
         style="position:absolute;left:-9999px" aria-hidden="true">
  <!-- Renders the page-load time so instant submissions can be detected. -->
  <input type="hidden" name="_t" value="">

  <button type="submit">Send</button>
</form>

<script>
  // Stamp the load time for the timing check.
  document.querySelector('input[name="_t"]').value = Date.now();
</script>`;

  const js = `const form = document.querySelector("#contact-form");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = Object.fromEntries(new FormData(form));
  payload._t = window.__formLoadedAt;   // set on page load

  const res = await fetch("${endpoint}", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  if (result.ok) {
    form.reset();
    // show your own success state here
  } else {
    // result.error is one of: origin_rejected, rate_limited,
    // captcha_failed, bad_request, not_found
    console.error(result.error, result.message);
  }
});

window.__formLoadedAt = Date.now();`;

  const curl = `curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "Origin: https://your-registered-domain" \\
  -d '{"name":"Test","email":"test@example.com","message":"Hello"}'`;

  return (
    <Tabs defaultValue="html">
      <TabsList>
        <TabsTrigger value="html">Plain HTML</TabsTrigger>
        <TabsTrigger value="js">JavaScript</TabsTrigger>
        <TabsTrigger value="curl">curl</TabsTrigger>
      </TabsList>
      <TabsContent value="html" className="mt-4 space-y-2">
        <p className="text-sm text-muted-foreground">
          Works with no JavaScript. The visitor is redirected to your thank-you
          URL after submitting.
        </p>
        <CopyBlock code={html} />
      </TabsContent>
      <TabsContent value="js" className="mt-4 space-y-2">
        <p className="text-sm text-muted-foreground">
          Stays on the page. The request origin must be one of the site&apos;s
          allowed origins or it will be rejected.
        </p>
        <CopyBlock code={js} />
      </TabsContent>
      <TabsContent value="curl" className="mt-4 space-y-2">
        <p className="text-sm text-muted-foreground">
          For testing the endpoint from a terminal.
        </p>
        <CopyBlock code={curl} />
      </TabsContent>
    </Tabs>
  );
}
