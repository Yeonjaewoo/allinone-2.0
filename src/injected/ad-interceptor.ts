/**
 * 치지직 광고 차단 및 안티-애드블록 우회 인터셉터
 * fetch 및 XMLHttpRequest를 프록시하여 광고 스케줄을 빈 목록으로 대체하고,
 * 광고 차단기 감지(OPTIONS 요청)를 무력화합니다.
 */

export class AdInterceptor {
  private static readonly VETA_RE = /(?:veta|siape|nam|tivan)\.naver\.com\//;
  private static readonly BANNER_RE = /^https:\/\/nng-phinf\.pstatic\.net\/[A-Za-z]+\/[A-Za-z0-9._-]+\/Banner_[A-Za-z0-9_-]+\.[A-Za-z]+$/;

  public static install(): void {
    if ((window as any).__CHZZK_CLEAN_AD_INTERCEPTOR_INSTALLED__) return;
    (window as any).__CHZZK_CLEAN_AD_INTERCEPTOR_INSTALLED__ = true;

    this.hookFetch();
    this.hookXHR();
    console.info("[ChzzkClean] 광고 인터셉터 및 안티-애드블록 우회 엔진 활성화 완료");
  }

  private static hookFetch(): void {
    const originalFetch = window.fetch;

    window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const [resource, config] = args;
      const url = typeof resource === "string" ? resource : resource instanceof URL ? resource.href : (resource as Request)?.url ?? "";
      const method = (config?.method ?? "GET").toUpperCase();

      // 1. 네이버 광고 OPTIONS 프리플라이트 요청 -> 200 OK로 속이기
      if (method === "OPTIONS" && this.VETA_RE.test(url)) {
        return new Response(JSON.stringify({ code: 200, message: "OK" }), {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        });
      }

      // 2. GFP 비디오 광고 스케줄 요청 -> 빈 광고 스케줄 반환
      if (this.VETA_RE.test(url) && (url.includes("vas") || url.includes("schedule") || url.includes("gfp"))) {
        return new Response(
          JSON.stringify({
            head: { version: "0.0.1", description: "GFP Video Ad Schedule" },
            requestId: "vas-clean-mock",
            videoAdScheduleId: "LIVE_CHZZK_NDP_SCH",
            adBreaks: [{ id: "", startDelay: 0, preFetch: 0, adUnitId: "", adSources: [] }],
          }),
          { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } }
        );
      }

      // 3. Waterfall 광고 요청 -> 빈 광고 목록 반환
      if (this.VETA_RE.test(url) && (url.includes("call") || url.includes("waterfall"))) {
        return new Response(
          JSON.stringify({
            head: { version: "0.0.1", description: "Naver SSP Waterfall List" },
            ads: [],
            videoSkipMin: 0,
            videoSkipAfter: 0,
          }),
          { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } }
        );
      }

      // 4. 배너 이미지 차단
      if (this.BANNER_RE.test(url)) {
        return new Response("", { status: 200 });
      }

      // 5. 일반 fetch 호출 후 응답 변조 (Rewrite)
      const response = await originalFetch(...args);

      if (url.includes("display-status")) {
        return new Response(
          JSON.stringify({
            code: 200,
            message: null,
            content: { playerAdDisplayResponse: { preRoll: false, midRoll: false } },
          }),
          { status: 200, headers: response.headers }
        );
      }

      if (url.includes("/seoraksan") || url.includes("live-detail") || url.includes("live-status")) {
        try {
          const clone = response.clone();
          const json = await clone.json();

          if (json?.content) {
            if (json.content.playerAdDisplayResponse) {
              json.content.playerAdDisplayResponse.preRoll = false;
              json.content.playerAdDisplayResponse.midRoll = false;
            }
            json.content.skipPreRollAd = true;
            json.content.dab = false;
          }

          return new Response(JSON.stringify(json), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        } catch {
          return response;
        }
      }

      return response;
    };
  }

  private static hookXHR(): void {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const originalResponseTextDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "responseText");

    (XMLHttpRequest.prototype as any).open = function (this: XMLHttpRequest, ...args: any[]) {
      (this as any)._cleanMethod = args[0];
      (this as any)._cleanUrl = typeof args[1] === "string" ? args[1] : args[1]?.href || "";
      return originalOpen.apply(this, args as any);
    };

    (XMLHttpRequest.prototype as any).send = function (this: XMLHttpRequest, ...args: any[]) {
      const url: string = (this as any)._cleanUrl || "";
      const method = ((this as any)._cleanMethod || "GET").toUpperCase();

      // OPTIONS 200 스텁
      if (method === "OPTIONS" && AdInterceptor.VETA_RE.test(url)) {
        Object.defineProperty(this, "status", { get: () => 200 });
        Object.defineProperty(this, "statusText", { get: () => "OK" });
        Object.defineProperty(this, "responseText", { get: () => JSON.stringify({ code: 200, message: "OK" }) });
        this.dispatchEvent(new Event("load"));
        return;
      }

      // XHR 응답 가로채기
      this.addEventListener("readystatechange", function () {
        if (this.readyState === 4 && (url.includes("live-detail") || url.includes("/seoraksan"))) {
          try {
            const raw = originalResponseTextDesc?.get?.call(this);
            if (raw) {
              const data = JSON.parse(raw);
              if (data?.content) {
                if (data.content.playerAdDisplayResponse) {
                  data.content.playerAdDisplayResponse.preRoll = false;
                  data.content.playerAdDisplayResponse.midRoll = false;
                }
                data.content.skipPreRollAd = true;
                data.content.dab = false;
              }
              const modified = JSON.stringify(data);
              Object.defineProperty(this, "responseText", { get: () => modified });
              Object.defineProperty(this, "response", { get: () => modified });
            }
          } catch {}
        }
      });

      return originalSend.apply(this, args as any);
    };
  }
}
