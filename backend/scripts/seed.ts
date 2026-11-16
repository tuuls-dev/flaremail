/* eslint-disable no-await-in-loop -- Seed messages are submitted in order through the local email simulator. */
const mailboxAddress = process.env.SEED_MAILBOX;

if (!mailboxAddress) {
	throw new Error(
		"Set SEED_MAILBOX to a configured development mailbox, e.g. SEED_MAILBOX=hello@example.com bun demo:seed",
	);
}

const applicationOrigin = process.env.APP_ORIGIN ?? "http://127.0.0.1:5173";
const simulatorUrl = new URL("/cdn-cgi/local/email", applicationOrigin);

if (!["127.0.0.1", "localhost", "[::1]"].includes(simulatorUrl.hostname)) {
	throw new Error("Set APP_ORIGIN to the local Vite server to seed demo mail.");
}

simulatorUrl.searchParams.set("to", mailboxAddress);
const examples = [
	{
		name: "Jordan Lee",
		address: "jordan@example.net",
		subject: "A little something for next week",
		body: "Hi team,\n\nI’ve put together a few ideas for next week. Let me know what you think.\n\nTalk soon,\nJordan",
	},
	{
		name: "Sam Rivera",
		address: "sam@example.net",
		subject: "The new direction is coming together",
		body: "Hey everyone,\n\nThe latest mockups are ready for a look. The quieter layout feels much better.\n\nHappy to walk through them tomorrow.\nSam",
	},
	{
		name: "Maya Chen",
		address: "maya@example.net",
		subject: "Coffee and a catch-up?",
		body: "Hi there,\n\nI’ll be in the neighborhood on Thursday. Would be lovely to catch up over coffee.\n\nMaya",
	},
	{
		name: "Northstar Team",
		address: "team@example.net",
		subject: "A few things worth sharing",
		body: "A few notes from this week:\n\n• Keep things clear.\n• Make space for good conversations.\n• Celebrate the small wins.\n\nSee you next week.",
	},
	{
		name: "Alex Parker",
		address: "alex@example.net",
		subject: "Notes from our conversation",
		body: "Hi team,\n\nThanks for the thoughtful conversation today. I’ve captured the main decisions and will share a follow-up shortly.\n\nCheers,\nAlex",
	},
];

for (const [index, example] of examples.entries()) {
	const sentTimestamp = Date.now() - index * 3600000;
	const sentAt = new Date(sentTimestamp).toUTCString();
	const messageId = `<demo-${index}-${mailboxAddress}@flaremail.local>`;
	const rawEmail = [
		`From: ${example.name} <${example.address}>`,
		`To: ${mailboxAddress}`,
		`Subject: ${example.subject}`,
		`Message-ID: ${messageId}`,
		`Date: ${sentAt}`,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		example.body,
	].join("\r\n");
	simulatorUrl.searchParams.set("from", example.address);
	const response = await fetch(simulatorUrl, {
		method: "POST",
		headers: { "Content-Type": "message/rfc822" },
		body: rawEmail,
	});

	if (!response.ok) {
		const failure = await response.text();
		throw new Error(`Could not seed message (${response.status}). ${failure}`);
	}

	await response.body?.cancel();
}

console.log("Submitted five sample conversations through the local email simulator.");

export {};
