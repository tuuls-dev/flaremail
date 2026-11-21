import { describe, expect, it } from "bun:test";
import { sanitizeEmail } from "../../src/platform/email/sanitize";

describe("email formatting", () => {
	it("preserves safe signature styles and table layout", () => {
		const html = sanitizeEmail(
			'<table width="600" cellpadding="8" cellspacing="0"><tr><td bgcolor="#fff" valign="top" style="color: #123456; font-family: Arial, sans-serif; font-size: 14px; padding: 8px; border-bottom: 1px solid #ddd"><b>Signature</b></td></tr></table><div class="gmail_quote">History</div>',
		);
		expect(html).toContain('width="600"');
		expect(html).toContain('cellpadding="8"');
		expect(html).toContain('bgcolor="#fff"');
		expect(html).toContain("font-size:14px");
		expect(html).toContain("color:#123456");
		expect(html).toContain("border-bottom:1px solid #ddd");
		expect(html).toContain('class="gmail_quote"');
	});

	it("removes active content and CSS resource loads", () => {
		const html = sanitizeEmail(
			'<style>@import "https://tracker.test";</style><script>alert(1)</script><div onclick="alert(1)" style="color:red; background-image:url(https://tracker.test); position:fixed; font-family:url(https://tracker.test); width:expression(alert(1))">Safe</div><img src="javascript:alert(1)" onerror="alert(1)"><a href="javascript:alert(1)">Link</a>',
		);
		expect(html).toContain("color:red");
		expect(html).not.toMatch(/script|onclick|onerror|tracker|position|expression|javascript/);
	});
});
