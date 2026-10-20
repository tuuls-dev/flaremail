import type { Row } from "@libsql/client";
import { readStringField, readNumberField } from "../../platform/database/client";

export function mapMailboxRecord(record: Row) {
	return {
		id: readStringField(record, "id"),
		orgId: readStringField(record, "org_id"),
		address: readStringField(record, "address"),
		name: readStringField(record, "name"),
		disabled: Boolean(readNumberField(record, "disabled")),
	};
}
