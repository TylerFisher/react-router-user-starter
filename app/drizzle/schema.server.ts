import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable(
	"users",
	{
		id: uuid().primaryKey().notNull().defaultRandom(),
		email: text().notNull().unique(),
		name: text(),
		createdAt: timestamp("created_at", { precision: 3, mode: "date" })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		emailConfirmed: boolean("email_confirmed").default(false).notNull(),
	}
);

export const emailTokens = pgTable(
	"email_tokens",
	{
		token: text().notNull(),
		createdAt: timestamp("created_at", { precision: 3, mode: "date" })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		userId: uuid("user_id")
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),
	},
);

export const passwords = pgTable("passwords", {
	hash: text().notNull(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" })
		.unique(),
});

export const sessions = pgTable(
	"sessions",
	{
		id: uuid().primaryKey().defaultRandom(),
		expirationDate: timestamp("expiration_date", { precision: 3, mode: "date" }).notNull(),
		createdAt: timestamp("created_at", { precision: 3, mode: "date" })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
  (table) => {
		return {
			userIdIdx: index("session_user_id_idx").using(
				"btree",
				table.userId.asc().nullsLast(),
			),
		};
	},
);

export const verification = pgTable(
	"verification",
	{
		id: uuid().primaryKey().defaultRandom(),
		createdAt: timestamp("created_at", { precision: 3, mode: "date" })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		type: text().notNull(),
		target: text().notNull(),
		secret: text().notNull(),
		algorithm: text().notNull(),
		digits: integer().notNull(),
		period: integer().notNull(),
		charSet: text("char_set").notNull(),
		expiresAt: timestamp("expires_at", { precision: 3, mode: "date" }),
	},
  	(table) => {
		return {
			targetTypeUnique: unique().on(table.target, table.type),
			targetTypeKey: uniqueIndex("verification_target_type_key").using(
				"btree",
				table.target.asc().nullsLast(),
				table.type.asc().nullsLast(),
			),
		};
	},
);


export const userRelations = relations(users, ({ one, many }) => ({
	password: one(passwords),
	sessions: many(sessions),
  tokens: many(emailTokens),
}));

export const emailTokenRelations = relations(emailTokens, ({ one }) => ({
  user: one(users),
}));

export const passwordRelations = relations(passwords, ({ one }) => ({
	user: one(users, {
		fields: [passwords.userId],
		references: [users.id],
	}),
}));

export const sessionRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id],
	}),
}));