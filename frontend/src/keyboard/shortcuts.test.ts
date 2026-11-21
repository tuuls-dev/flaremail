/// <reference types="bun" />
import { describe, expect, it } from "bun:test";
import { formatShortcut, matchShortcut, readShortcutKeys, readShortcutPlatform } from "./shortcuts";

function createShortcutEvent(overrides: Partial<Parameters<typeof matchShortcut>[0]> = {}) {
	return Object.assign(
		{
			key: "N",
			metaKey: true,
			ctrlKey: false,
			shiftKey: true,
			altKey: false,
			defaultPrevented: false,
			isComposing: false,
			repeat: false,
		},
		overrides,
	);
}

describe("app shortcuts", () => {
	it.each([
		["N", "compose"],
		["F", "search"],
		["ArrowDown", "nextConversation"],
		["ArrowUp", "previousConversation"],
		["Enter", "openConversation"],
		["X", "toggleSelection"],
		["E", "archive"],
		["R", "reply"],
		["ArrowLeft", "closeConversation"],
		["?", "showHelp"],
	] as const)("maps the platform modifier + Shift + %s to %s", (key, action) => {
		const macEvent = createShortcutEvent({ key });
		const otherEvent = createShortcutEvent({ key, metaKey: false, ctrlKey: true });
		expect(matchShortcut(macEvent, "mailbox", "mac")).toBe(action);
		expect(matchShortcut(otherEvent, "mailbox", "other")).toBe(action);
	});

	it("normalizes letter casing and shifted slash without relying on physical key positions", () => {
		expect(matchShortcut(createShortcutEvent({ key: "n" }), "mailbox", "mac")).toBe("compose");
		expect(matchShortcut(createShortcutEvent({ key: "/" }), "mailbox", "mac")).toBe("showHelp");
	});

	it.each([
		{ metaKey: false },
		{ shiftKey: false },
		{ ctrlKey: true },
		{ altKey: true },
		{ defaultPrevented: true },
		{ isComposing: true },
		{ repeat: true },
	])(
		"ignores incomplete, extra-modifier, or unsafe events: %j",
		(overrides: Partial<Parameters<typeof matchShortcut>[0]>) => {
			expect(matchShortcut(createShortcutEvent(overrides), "mailbox", "mac")).toBeUndefined();
			const otherOverrides = Object.assign({}, overrides, {
				metaKey: overrides.ctrlKey ?? false,
				ctrlKey: overrides.metaKey ?? true,
			});
			expect(
				matchShortcut(createShortcutEvent(otherOverrides), "mailbox", "other"),
			).toBeUndefined();
		},
	);

	it("requires the platform's own primary modifier", () => {
		const macEvent = createShortcutEvent();
		const otherEvent = createShortcutEvent({ metaKey: false, ctrlKey: true });
		expect(matchShortcut(macEvent, "mailbox", "other")).toBeUndefined();
		expect(matchShortcut(otherEvent, "mailbox", "mac")).toBeUndefined();
	});

	it.each(["c", "/", "j", "k", "Enter", "x", "e", "r", "?", "Escape"])(
		"does not treat unmodified %s as an app shortcut",
		(key) => {
			const event = createShortcutEvent({ key, metaKey: false, shiftKey: false });
			expect(matchShortcut(event, "mailbox", "mac")).toBeUndefined();
			expect(matchShortcut(event, "mailbox", "other")).toBeUndefined();
		},
	);

	it("scopes Enter to Open in the mailbox and Send only in the composer", () => {
		const event = createShortcutEvent({ key: "Enter" });
		expect(matchShortcut(event, "mailbox", "mac")).toBe("openConversation");
		expect(matchShortcut(event, "composer", "mac")).toBe("send");
		expect(matchShortcut(createShortcutEvent(), "composer", "mac")).toBeUndefined();
		const oldSendEvent = createShortcutEvent({ key: "Enter", shiftKey: false });
		expect(matchShortcut(oldSendEvent, "composer", "mac")).toBeUndefined();
		const otherEvent = createShortcutEvent({ key: "Enter", metaKey: false, ctrlKey: true });
		expect(matchShortcut(otherEvent, "composer", "other")).toBe("send");
		const oldOtherSendEvent = createShortcutEvent({
			key: "Enter",
			metaKey: false,
			ctrlKey: true,
			shiftKey: false,
		});
		expect(matchShortcut(oldOtherSendEvent, "composer", "other")).toBeUndefined();
	});

	it("renders platform-specific hints from the shared shortcut definitions", () => {
		expect(readShortcutKeys("compose", "mac")).toEqual(["⌘", "⇧", "N"]);
		expect(formatShortcut("compose", "mac")).toBe("⌘ ⇧ N");
		expect(formatShortcut("compose", "other")).toBe("Ctrl+Shift+N");
		expect(formatShortcut("send", "other")).toBe("Ctrl+Shift+↵");
		expect(formatShortcut("showHelp", "mac")).toBe("⌘ ⇧ /");
	});

	it.each(["MacIntel", "Mac68K", "iPhone", "iPad", "iPod"])(
		"uses Command for the Apple platform %s",
		(platform) => {
			expect(readShortcutPlatform(platform)).toBe("mac");
		},
	);

	it.each(["Win32", "Linux x86_64", ""])("uses Ctrl for platform %s", (platform) => {
		expect(readShortcutPlatform(platform)).toBe("other");
	});
});
