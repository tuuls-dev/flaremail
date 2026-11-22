<script lang="ts">
	import { onMount } from "svelte";
	import { Editor } from "@tiptap/core";
	import StarterKit from "@tiptap/starter-kit";
	import Link from "@tiptap/extension-link";
	import Dialog from "../../components/ui/Dialog.svelte";
	import Icon from "../../components/ui/Icon.svelte";
	let {
		initialHtml,
		onchange,
		disabled = false,
	}: {
		initialHtml: string;
		onchange: (html: string, text: string) => void;
		disabled?: boolean;
	} = $props();
	let editorElement: HTMLDivElement;
	let editor = $state.raw<Editor | null>(null);
	let boldActive = $state(false);
	let italicActive = $state(false);
	let listActive = $state(false);
	let linkOpen = $state(false);
	let linkUrl = $state("");
	onMount(() => {
		editor = new Editor({
			element: editorElement,
			extensions: [
				StarterKit,
				Link.configure({
					openOnClick: false,
					autolink: true,
					protocols: ["http", "https", "mailto"],
				}),
			],
			content: initialHtml,
			editorProps: {
				attributes: {
					role: "textbox",
					"aria-label": "Message body",
					"aria-multiline": "true",
					"data-placeholder": "Write a message…",
				},
			},
			onUpdate: ({ editor: activeEditor }) =>
				onchange(activeEditor.getHTML(), activeEditor.getText()),
			onTransaction: ({ editor: activeEditor }) => {
				boldActive = activeEditor.isActive("bold");
				italicActive = activeEditor.isActive("italic");
				listActive = activeEditor.isActive("bulletList");
			},
		});
		return () => editor?.destroy();
	});
	$effect(() => {
		editor?.setEditable(!disabled);
	});

	function insertLink(event: SubmitEvent) {
		event.preventDefault();

		if (!editor) {
			return;
		}

		if (linkUrl) {
			editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run();
		} else {
			editor.chain().focus().unsetLink().run();
		}

		linkOpen = false;
	}
</script>

<div class="rich-editor">
	<div class="formatting" role="toolbar" aria-label="Message formatting">
		<button
			type="button"
			class="icon-button"
			class:active={boldActive}
			aria-label="Bold"
			aria-pressed={boldActive}
			{disabled}
			onclick={() => editor?.chain().focus().toggleBold().run()}
			><Icon name="bold" size={16} /></button
		><button
			type="button"
			class="icon-button"
			class:active={italicActive}
			aria-label="Italic"
			aria-pressed={italicActive}
			{disabled}
			onclick={() => editor?.chain().focus().toggleItalic().run()}
			><Icon name="italic" size={16} /></button
		><span></span><button
			type="button"
			class="icon-button"
			class:active={listActive}
			aria-label="Bullet list"
			aria-pressed={listActive}
			{disabled}
			onclick={() => editor?.chain().focus().toggleBulletList().run()}
			><Icon name="list" size={17} /></button
		><button
			type="button"
			class="icon-button"
			aria-label="Insert link"
			{disabled}
			onclick={() => {
				linkUrl = editor?.getAttributes("link").href ?? "";
				linkOpen = true;
			}}><Icon name="link" size={16} /></button
		><span></span><button
			type="button"
			class="icon-button"
			aria-label="Undo typing"
			{disabled}
			onclick={() => editor?.chain().focus().undo().run()}><Icon name="undo" size={16} /></button
		>
	</div>
	<div bind:this={editorElement} class="editor-body"></div>
</div>
<Dialog bind:open={linkOpen} title="Add a link"
	><form class="form-stack" onsubmit={insertLink}>
		<label class="field"
			>Link URL<input type="url" bind:value={linkUrl} placeholder="https://example.com" /></label
		>
		<div class="form-actions">
			<button class="button primary">{linkUrl ? "Insert link" : "Remove link"}</button>
		</div>
	</form></Dialog
>

<style>
	.rich-editor {
		display: flex;
		flex-direction: column;
		min-height: 240px;
	}
	.formatting {
		display: flex;
		align-items: center;
		gap: 3px;
		border-bottom: 1px solid var(--color-border);
		padding: 7px 0;
	}
	.formatting > span {
		height: 15px;
		width: 1px;
		background: var(--color-border);
		margin: 0 6px;
	}
	.formatting .icon-button {
		height: 30px;
		width: 30px;
	}
	.editor-body {
		flex: 1;
		max-height: 40dvh;
		overflow: auto;
	}
	.editor-body :global(.tiptap) {
		outline: none;
		min-height: 200px;
		padding: 18px 1px;
		font-size: 13px;
		line-height: 1.8;
		color: var(--color-text);
	}
	.editor-body :global(.tiptap p) {
		margin: 0 0 12px;
	}
	.editor-body :global(.tiptap:focus-visible) {
		outline: none;
	}
	.editor-body :global(.tiptap p:only-child:has(br:only-child)::before) {
		content: "Write a message…";
		color: var(--color-faint);
		pointer-events: none;
		float: left;
		height: 0;
	}
	.editor-body :global(.tiptap a) {
		color: var(--color-primary);
		text-decoration: underline;
	}
	.editor-body :global(.tiptap blockquote) {
		border-left: 2px solid var(--color-border);
		padding-left: 16px;
		color: var(--color-muted);
	}
</style>
