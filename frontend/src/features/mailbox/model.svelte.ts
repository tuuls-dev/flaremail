import type {
	Result,
	MessageSummary,
	Message,
	Label,
	Draft,
	Params,
	Folder,
} from "@flaremail/contracts";
import { query, mutate, describeError, RpcError } from "../../sdk/client";
import { toast } from "svelte-sonner";
export type MailScope = {
	orgId: string;
	mailboxId: string;
	folder: string;
	search: string;
	labelId?: string;
	threadId?: string;
};
const folders = new Set(["inbox", "starred", "sent", "archive", "trash", "all"]);
export class MailboxModel {
	workspace = $state<Result<"workspace.list">>({ organizations: [], mailboxes: [] });
	items = $state<MessageSummary[]>([]);
	messages = $state<Message[]>([]);
	labels = $state<Label[]>([]);
	drafts = $state<Draft[]>([]);
	counts = $state<Result<"mail.counts">>({
		inbox: 0,
		unread: 0,
		drafts: 0,
		starred: 0,
		sent: 0,
		trash: 0,
	});
	total = $state(0);
	offset = $state(0);
	loading = $state(true);
	refreshing = $state(false);
	threadLoading = $state(false);
	errorMessage = $state("");
	threadError = $state("");
	selected = $state<string[]>([]);
	scope: MailScope | null = null;
	private requestVersion = 0;
	private threadVersion = 0;
	private activeController: AbortController | null = null;
	private workspacePromise: Promise<void> | null = null;
	async loadWorkspace() {
		this.workspace = await query("workspace.list", {});
	}
	private resetScopeState(scope: MailScope) {
		const changedMailbox = this.scope?.mailboxId !== scope.mailboxId;
		const previousListKey = buildListKey(this.scope);
		const nextListKey = buildListKey(scope);
		const changedList = previousListKey !== nextListKey;
		const changedThread = changedMailbox || this.scope?.threadId !== scope.threadId;
		this.scope = scope;

		if (changedList) {
			this.offset = 0;
			this.selected = [];
			this.items = [];
		}

		if (changedMailbox) {
			this.labels = [];
			this.messages = [];
			this.counts = { inbox: 0, unread: 0, drafts: 0, starred: 0, sent: 0, trash: 0 };
		}

		return { changedList, changedThread };
	}
	async openScope(scope: MailScope) {
		const { changedList, changedThread } = this.resetScopeState(scope);

		if (!this.workspacePromise) {
			this.workspacePromise = this.loadWorkspace();
		}

		try {
			await this.workspacePromise;
		} catch (error) {
			this.errorMessage = describeError(error);
			this.loading = false;
			return;
		}

		if (changedThread) {
			void this.loadConversation(scope);
		}

		if (changedList) {
			await this.refreshMailbox(true);
		}
	}
	async refreshMailbox(showLoading = false) {
		const scope = this.scope;

		if (!scope) {
			return;
		}

		const requestVersion = ++this.requestVersion;
		this.activeController?.abort();
		const controller = new AbortController();
		this.activeController = controller;
		this.loading = this.loading || showLoading;
		this.refreshing = true;
		this.errorMessage = "";

		try {
			const folder = resolveSearchFolder(scope);
			const listPromise =
				scope.folder === "drafts"
					? Promise.resolve({ items: [], total: 0 })
					: query(
							"mail.list",
							{
								mailboxId: scope.mailboxId,
								folder,
								search: scope.search,
								labelId: scope.labelId,
								offset: this.offset,
							},
							controller.signal,
						);
			const [listResult, counts, labels, drafts] = await Promise.all([
				listPromise,
				query("mail.counts", { mailboxId: scope.mailboxId }, controller.signal),
				query("labels.list", { mailboxId: scope.mailboxId }, controller.signal),
				query("drafts.list", { mailboxId: scope.mailboxId }, controller.signal),
			]);

			if (requestVersion !== this.requestVersion) {
				return;
			}

			this.items = listResult.items;
			this.total = listResult.total;
			this.counts = counts;
			this.labels = labels;
			this.drafts = drafts;
			this.selected = this.selected.filter((threadId) =>
				this.items.some((item) => item.threadId === threadId),
			);
		} catch (error) {
			this.handleRefreshError(error, controller.signal);
		} finally {
			if (requestVersion === this.requestVersion) {
				this.loading = false;
				this.refreshing = false;
			}
		}
	}
	private handleRefreshError(error: unknown, signal: AbortSignal) {
		if (signal.aborted) {
			return;
		}

		this.errorMessage = describeError(error);

		if (error instanceof RpcError && error.kind === "FORBIDDEN") {
			this.clearInaccessibleMailbox(this.errorMessage);
		}
	}
	private clearInaccessibleMailbox(message: string) {
		this.messages = [];
		this.items = [];
		this.drafts = [];
		this.labels = [];
		this.selected = [];
		this.threadError = message;
		void this.loadWorkspace().catch(() => {});
	}
	async loadConversation(scope: MailScope) {
		const threadVersion = ++this.threadVersion;
		this.messages = [];
		this.threadError = "";

		if (!scope.threadId) {
			this.threadLoading = false;
			return;
		}

		this.threadLoading = true;

		try {
			const messages = await query("mail.thread", {
				mailboxId: scope.mailboxId,
				threadId: scope.threadId,
			});

			if (threadVersion !== this.threadVersion) {
				return;
			}

			this.messages = messages;
			await mutate("mail.update", {
				mailboxId: scope.mailboxId,
				threadIds: [scope.threadId],
				unread: false,
			});

			if (threadVersion === this.threadVersion) {
				this.items = this.items.map((item) =>
					item.threadId === scope.threadId ? Object.assign({}, item, { unread: false }) : item,
				);
				void this.refreshMailbox();
			}
		} catch (error) {
			if (threadVersion === this.threadVersion) {
				this.threadError = describeError(error);
			}
		} finally {
			if (threadVersion === this.threadVersion) {
				this.threadLoading = false;
			}
		}
	}
	toggleSelection(threadId: string) {
		this.selected = this.selected.includes(threadId)
			? this.selected.filter((selectedId) => selectedId !== threadId)
			: this.selected.concat(threadId);
	}
	selectAll() {
		this.selected =
			this.selected.length === this.items.length ? [] : this.items.map((item) => item.threadId);
	}
	async updateThreads(
		threadIds: string[],
		changes: Omit<Params<"mail.update">, "mailboxId" | "threadIds">,
	) {
		const scope = this.scope;

		if (!scope || !threadIds.length) {
			return;
		}

		try {
			const updateResult = await mutate(
				"mail.update",
				Object.assign({ mailboxId: scope.mailboxId, threadIds }, changes),
			);

			if (changes.folder) {
				const notificationMessage = describeFolderMove(changes.folder);
				toast.success(notificationMessage, {
					action: {
						label: "Undo",
						onClick: () => {
							void this.restoreFolders(scope.mailboxId, updateResult.previousFolders);
						},
					},
				});
			}

			if (this.scope?.mailboxId === scope.mailboxId) {
				this.selected = [];
				await this.refreshMailbox();
			}
		} catch (error) {
			toast.error(describeError(error));
		}
	}
	async restoreFolders(mailboxId: string, states: Result<"mail.update">["previousFolders"]) {
		try {
			await mutate("mail.restoreFolders", { mailboxId, states });

			if (this.scope?.mailboxId === mailboxId) {
				await this.refreshMailbox();
			}
		} catch (error) {
			toast.error(describeError(error));
		}
	}
	async applyLabel(threadIds: string[], labelId: string, remove: boolean) {
		if (!this.scope || !threadIds.length) {
			return;
		}

		try {
			await mutate("mail.label", { mailboxId: this.scope.mailboxId, threadIds, labelId, remove });
			await this.refreshMailbox();
		} catch (error) {
			toast.error(describeError(error));
		}
	}
	async changePage(direction: number) {
		const nextOffset = this.offset + direction * 40;
		this.offset = Math.max(0, nextOffset);
		this.selected = [];
		await this.refreshMailbox(true);
	}
	destroy() {
		this.activeController?.abort();
		this.requestVersion++;
		this.threadVersion++;
	}
}

function buildListKey(scope: MailScope | null) {
	if (!scope) {
		return "";
	}

	return JSON.stringify([scope.mailboxId, scope.folder, scope.search, scope.labelId]);
}

function describeFolderMove(folder: string) {
	if (folder === "trash") {
		return "Moved to trash";
	}

	if (folder === "archive") {
		return "Conversation archived";
	}

	return "Moved to inbox";
}

function resolveSearchFolder(scope: MailScope): Folder {
	if (scope.search) {
		return "all";
	}

	return folders.has(scope.folder) ? (scope.folder as Folder) : "inbox";
}
