import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname, relative, sep } from "node:path";

async function listSourceFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nestedFiles = await Promise.all(
		entries.map((entry) => {
			const entryPath = resolve(directory, entry.name);

			if (entry.isDirectory()) {
				return listSourceFiles(entryPath);
			}

			const isSourceFile = entry.name.endsWith(".ts") || entry.name.endsWith(".svelte");
			const sourceFiles = isSourceFile ? [entryPath] : [];
			return Promise.resolve(sourceFiles);
		}),
	);
	return nestedFiles.flat();
}

function findBoundaryViolation(sourcePath: string, importPath: string) {
	const normalizedSource = sourcePath.split(sep).join("/");

	if (normalizedSource.includes("/backend/contracts/") && importPath.startsWith("../")) {
		return "Contracts may not import server code.";
	}

	if (normalizedSource.includes("/frontend/src/") && importPath.includes("@flaremail/backend")) {
		return "The frontend may import only @flaremail/contracts from the backend.";
	}

	if (!importPath.startsWith(".")) {
		return null;
	}

	const resolvedImport = resolve(dirname(sourcePath), importPath).split(sep).join("/");

	if (normalizedSource.includes("/frontend/src/") && resolvedImport.includes("/backend/")) {
		return "Import browser-safe contracts through @flaremail/contracts.";
	}

	if (normalizedSource.includes("/backend/src/") && resolvedImport.includes("/frontend/")) {
		return "Backend runtime code must not depend on the frontend.";
	}

	return checkModuleBoundary(normalizedSource, resolvedImport);
}

function checkModuleBoundary(sourcePath: string, resolvedImport: string) {
	const sourceModule = sourcePath.match(/\/backend\/src\/modules\/([^/]+)\//)?.[1];
	const targetModule = resolvedImport.match(/\/backend\/src\/modules\/([^/]+)\//)?.[1];

	if (!targetModule || sourceModule === targetModule) {
		return null;
	}

	if (!resolvedImport.endsWith("/index")) {
		return "Use the module’s explicit public index instead of importing its internals.";
	}

	return null;
}

const sourceDirectories = ["backend/src", "backend/contracts/src", "frontend/src"];
const files = (await Promise.all(sourceDirectories.map(listSourceFiles))).flat();
const violations: string[] = [];
await Promise.all(
	files.map(async (sourcePath) => {
		const content = await readFile(sourcePath, "utf8");
		const imports = content.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g);

		for (const match of imports) {
			const violation = findBoundaryViolation(sourcePath, match[1]);

			if (violation) {
				violations.push(`${relative(process.cwd(), sourcePath)}: ${violation} (${match[1]})`);
			}
		}
	}),
);

if (violations.length) {
	console.error(violations.join("\n"));
	process.exit(1);
}

console.log("Module and browser/server boundaries verified.");
