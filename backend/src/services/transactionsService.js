import { randomUUID } from "crypto";
import { query } from "../db/query.js";
import { pool } from "../db/pool.js";
import { materializeDueRecurringTransactions } from "./recurringMaterializationService.js";

function validateTransactionInput(input) {
  if (!input.txn_date) {
    const err = new Error("txn_date is required");
    err.status = 400;
    throw err;
  }
  if (!input.description || !String(input.description).trim()) {
    const err = new Error("description is required");
    err.status = 400;
    throw err;
  }
  if (!["income", "expense", "transfer"].includes(input.type)) {
    const err = new Error("type must be income, expense, or transfer");
    err.status = 400;
    throw err;
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    const err = new Error("amount must be a non-negative number");
    err.status = 400;
    throw err;
  }
}

function normalizeIsoDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

function isFutureDate(txnDate) {
  const todayIso = new Date().toISOString().slice(0, 10);
  return normalizeIsoDate(txnDate) > todayIso;
}

function ensureClearedRule(txnDate, cleared) {
  if (isFutureDate(txnDate) && Boolean(cleared)) {
    const err = new Error("Future transactions cannot be cleared.");
    err.status = 400;
    throw err;
  }
}

function parseAccountId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validateTransferInput(input) {
  const fromAccountId = parseAccountId(input.from_account_id);
  const toAccountId = parseAccountId(input.to_account_id);

  if (!fromAccountId || !toAccountId) {
    const err = new Error("transfer requires both from_account_id and to_account_id");
    err.status = 400;
    throw err;
  }

  if (fromAccountId === toAccountId) {
    const err = new Error("transfer accounts must be different");
    err.status = 400;
    throw err;
  }

  return { fromAccountId, toAccountId };
}

function stripTransferSuffix(description) {
  const text = String(description || "").trim();
  if (!text) return "";
  return text.replace(/\s*\(Transfer (to|from) [^)]+\)\s*$/i, "").trim();
}

function buildTransferLegDescriptions(baseDescription, fromAccountName, toAccountName) {
  const normalized = stripTransferSuffix(baseDescription) || "Transfer";
  return {
    outgoingDescription: `${normalized} (Transfer to ${toAccountName})`,
    incomingDescription: `${normalized} (Transfer from ${fromAccountName})`
  };
}

function parseFilters(filters = {}) {
  const where = [];
  const params = [];

  const push = (sql, value) => {
    params.push(value);
    where.push(sql.replace("$?", `$${params.length}`));
  };

  if (filters.from) push("t.txn_date >= $?", filters.from);
  if (filters.to) push("t.txn_date <= $?", filters.to);
  if (filters.type) push("t.type = $?", filters.type);
  if (filters.account_id) push("t.account_id = $?", Number(filters.account_id));
  if (filters.category_id) push("t.category_id = $?", Number(filters.category_id));
  if (typeof filters.cleared === "boolean") push("t.cleared = $?", filters.cleared);
  if (String(filters.search || "").trim()) {
    push("POSITION(LOWER($?) IN LOWER(CONCAT_WS(' ', t.description, t.account_name, t.category_name, t.type, t.amount::TEXT))) > 0", String(filters.search).trim());
  }

  return { where, params };
}

export async function listTransactions(filters = {}) {
  await materializeDueRecurringTransactions();

  const { where, params } = parseFilters(filters);
  const sql = `
    WITH enriched AS (
      SELECT
        t.id,
        t.txn_date,
        t.description,
        t.amount,
        t.type,
        t.cleared,
        t.is_one_time,
        t.recurring_rule_id,
        t.transfer_pair_id,
        t.account_id,
        t.category_id,
        COALESCE(o.sort_order, 0) AS sort_order,
        a.name AS account_name,
        c.name AS category_name,
        CASE
          WHEN t.account_id IS NULL THEN NULL
          ELSE SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
            OVER (
              PARTITION BY t.account_id
              ORDER BY t.txn_date ASC, COALESCE(o.sort_order, 0) ASC, t.id ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )
        END AS account_total_as_of
      FROM transactions t
      LEFT JOIN accounts a ON a.id = t.account_id
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN recurring_entries r ON r.id = t.recurring_rule_id
      LEFT JOIN transaction_order o ON o.transaction_key = CASE
        WHEN t.recurring_rule_id IS NOT NULL THEN
          'recurring:' || t.recurring_rule_id || ':' || TO_CHAR(t.txn_date, 'YYYY-MM-DD') || ':' || COALESCE(t.account_id, 0)
        ELSE 'transaction:' || t.id
      END
      WHERE (
        t.recurring_rule_id IS NULL
        OR r.id IS NULL
        OR t.txn_date >= r.start_date
      )
    )
    SELECT *
    FROM enriched t
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY t.txn_date DESC, t.sort_order DESC, t.id DESC
  `;
  const { rows } = await query(sql, params);
  return rows;
}

export async function createTransaction(input) {
  validateTransactionInput(input);
  ensureClearedRule(input.txn_date, input.cleared);

  if (input.type !== "transfer") {
    const sql = `
      INSERT INTO transactions
      (txn_date, description, amount, type, cleared, account_id, category_id, is_one_time, recurring_rule_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const params = [
      input.txn_date,
      input.description,
      Number(input.amount),
      input.type,
      Boolean(input.cleared),
      input.account_id || null,
      input.category_id || null,
      input.is_one_time !== false,
      input.recurring_rule_id || null
    ];
    const { rows } = await query(sql, params);
    return rows[0];
  }

  const { fromAccountId, toAccountId } = validateTransferInput(input);
  const amount = Number(input.amount);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const accountSql = "SELECT id, name FROM accounts WHERE id = ANY($1::INT[])";
    const { rows: accountRows } = await client.query(accountSql, [[fromAccountId, toAccountId]]);
    const accountById = new Map(accountRows.map((row) => [Number(row.id), row.name]));
    if (!accountById.has(fromAccountId) || !accountById.has(toAccountId)) {
      const err = new Error("transfer accounts not found");
      err.status = 400;
      throw err;
    }

    const pairId = randomUUID();
    const { outgoingDescription, incomingDescription } = buildTransferLegDescriptions(
      input.description || "Transfer",
      accountById.get(fromAccountId),
      accountById.get(toAccountId)
    );

    const insertSql = `
      INSERT INTO transactions
      (txn_date, description, amount, type, cleared, account_id, category_id, is_one_time, recurring_rule_id, transfer_pair_id)
      VALUES ($1, $2, $3, $4, $5, $6, NULL, true, NULL, $7)
      RETURNING *
    `;

    const { rows: outgoingRows } = await client.query(insertSql, [
      input.txn_date,
      outgoingDescription,
      amount,
      "expense",
      Boolean(input.cleared),
      fromAccountId,
      pairId
    ]);

    const { rows: incomingRows } = await client.query(insertSql, [
      input.txn_date,
      incomingDescription,
      amount,
      "income",
      Boolean(input.cleared),
      toAccountId,
      pairId
    ]);

    await client.query("COMMIT");

    return {
      transfer: true,
      from_transaction: outgoingRows[0],
      to_transaction: incomingRows[0]
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTransaction(id, input) {
  validateTransactionInput(input);
  if (input.type === "transfer") {
    const err = new Error("transfer update is not supported; edit each transfer leg as income/expense");
    err.status = 400;
    throw err;
  }
  ensureClearedRule(input.txn_date, input.cleared);

  const { rows: existingRows } = await query(
    "SELECT id, txn_date, cleared, is_one_time, recurring_rule_id, transfer_pair_id, type, account_id FROM transactions WHERE id = $1",
    [id]
  );
  const existing = existingRows[0];
  if (!existing) return null;

  if (existing.transfer_pair_id) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: pairRows } = await client.query(
        "SELECT id, type, account_id FROM transactions WHERE transfer_pair_id = $1 ORDER BY id ASC",
        [existing.transfer_pair_id]
      );
      if (pairRows.length !== 2) {
        const err = new Error("transfer pair is incomplete");
        err.status = 400;
        throw err;
      }

      const editedRow = pairRows.find((row) => String(row.id) === String(id));
      const otherRow = pairRows.find((row) => String(row.id) !== String(id));
      if (!editedRow || !otherRow) {
        const err = new Error("transfer pair is incomplete");
        err.status = 400;
        throw err;
      }

      const editedAccountId = parseAccountId(input.account_id);
      if (!editedAccountId) {
        const err = new Error("transfer leg requires an account");
        err.status = 400;
        throw err;
      }

      const otherAccountId = parseAccountId(otherRow.account_id);
      if (!otherAccountId) {
        const err = new Error("transfer pair is incomplete");
        err.status = 400;
        throw err;
      }

      const editedIsFromSide = editedRow.type === "expense";
      const fromAccountId = editedIsFromSide ? editedAccountId : otherAccountId;
      const toAccountId = editedIsFromSide ? otherAccountId : editedAccountId;

      if (fromAccountId === toAccountId) {
        const err = new Error("transfer accounts must be different");
        err.status = 400;
        throw err;
      }

      const { rows: accountRows } = await client.query(
        "SELECT id, name FROM accounts WHERE id = ANY($1::INT[])",
        [[fromAccountId, toAccountId]]
      );
      const accountById = new Map(accountRows.map((row) => [Number(row.id), row.name]));
      if (!accountById.has(fromAccountId) || !accountById.has(toAccountId)) {
        const err = new Error("transfer accounts not found");
        err.status = 400;
        throw err;
      }

      const { outgoingDescription, incomingDescription } = buildTransferLegDescriptions(
        input.description,
        accountById.get(fromAccountId),
        accountById.get(toAccountId)
      );
      const amount = Number(input.amount);
      const cleared = Boolean(input.cleared);
      const txnDate = input.txn_date;

      const outgoingRow = pairRows.find((row) => row.type === "expense");
      const incomingRow = pairRows.find((row) => row.type === "income");
      if (!outgoingRow || !incomingRow) {
        const err = new Error("transfer pair is invalid");
        err.status = 400;
        throw err;
      }

      const updateSql = `
        UPDATE transactions
        SET txn_date = $1, description = $2, amount = $3, type = $4, cleared = $5,
            account_id = $6, category_id = $7, is_one_time = true, recurring_rule_id = NULL
        WHERE id = $8
        RETURNING *
      `;

      const parsedCategoryId = Number(input.category_id);
      const categoryId = Number.isInteger(parsedCategoryId) && parsedCategoryId > 0 ? parsedCategoryId : null;

      const { rows: updatedOutgoingRows } = await client.query(updateSql, [
        txnDate,
        outgoingDescription,
        amount,
        "expense",
        cleared,
        fromAccountId,
        categoryId,
        outgoingRow.id
      ]);

      const { rows: updatedIncomingRows } = await client.query(updateSql, [
        txnDate,
        incomingDescription,
        amount,
        "income",
        cleared,
        toAccountId,
        categoryId,
        incomingRow.id
      ]);

      await client.query("COMMIT");

      const updatedRows = [...updatedOutgoingRows, ...updatedIncomingRows];
      return updatedRows.find((row) => String(row.id) === String(id)) || updatedRows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // When the date of an uncleared materialized recurring transaction changes, detach it
  // from the schedule so the materialization engine doesn't revert the edit. We also
  // create an is_deleted modification for the original scheduled date so that the
  // materialization does not re-create the old occurrence.
  let effectiveIsOneTime = input.is_one_time !== false;
  const newTxnDate = normalizeIsoDate(input.txn_date);
  const oldTxnDate = normalizeIsoDate(existing.txn_date);
  if (
    existing.recurring_rule_id &&
    existing.is_one_time === false &&
    !Boolean(existing.cleared) &&
    newTxnDate &&
    newTxnDate !== oldTxnDate
  ) {
    effectiveIsOneTime = true;

    // Find the canonical scheduled date for this occurrence. If a one_time modification
    // moved the occurrence to the current txn_date via override_txn_date, the scheduled
    // date is that modification's start_date; otherwise it is the txn_date itself.
    const modResult = await query(
      `SELECT start_date FROM recurring_modifications
       WHERE recurring_rule_id = $1
         AND modification_type = 'one_time'
         AND override_txn_date::date = $2::date
         AND is_deleted = false
       ORDER BY id DESC LIMIT 1`,
      [existing.recurring_rule_id, oldTxnDate]
    );
    const scheduledDate = modResult.rows[0]
      ? normalizeIsoDate(modResult.rows[0].start_date)
      : oldTxnDate;

    // Mark the original scheduled occurrence as deleted so the materialization skips it.
    await query(
      `INSERT INTO recurring_modifications
         (recurring_rule_id, modification_type, start_date, is_deleted)
       VALUES ($1, 'one_time', $2, true)`,
      [existing.recurring_rule_id, scheduledDate]
    );
  }

  const sql = `
    UPDATE transactions
    SET txn_date = $1, description = $2, amount = $3, type = $4, cleared = $5,
        account_id = $6, category_id = $7, is_one_time = $8, recurring_rule_id = $9
    WHERE id = $10
    RETURNING *
  `;
  const params = [
    input.txn_date,
    input.description,
    Number(input.amount),
    input.type,
    Boolean(input.cleared),
    input.account_id || null,
    input.category_id || null,
    effectiveIsOneTime,
    input.recurring_rule_id || null,
    id
  ];
  const { rows } = await query(sql, params);
  return rows[0];
}

export async function deleteTransaction(id) {
  const { rows: existing } = await query(
    "SELECT id, txn_date, cleared, transfer_pair_id, recurring_rule_id, is_one_time FROM transactions WHERE id = $1",
    [id]
  );
  if (existing.length === 0) return false;
  
  const transaction = existing[0];
  if (Boolean(transaction.cleared)) {
    const err = new Error("Cannot delete a cleared transaction.");
    err.status = 400;
    throw err;
  }
  
  const pairId = transaction.transfer_pair_id;
  if (pairId) {
    const { rows: pairRows } = await query(
      "SELECT id, txn_date, cleared, recurring_rule_id, is_one_time FROM transactions WHERE transfer_pair_id = $1",
      [pairId]
    );
    if (pairRows.some((row) => Boolean(row.cleared))) {
      const err = new Error("Cannot delete a transfer with a cleared transaction.");
      err.status = 400;
      throw err;
    }

    const generatedRecurringLeg = pairRows.find((row) => Boolean(row.recurring_rule_id) && row.is_one_time === false);
    if (generatedRecurringLeg) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const recurringRuleId = Number(generatedRecurringLeg.recurring_rule_id);
        const occurrenceDate = normalizeIsoDate(generatedRecurringLeg.txn_date);
        const anchorLookupSql = `
          SELECT start_date
          FROM recurring_modifications
          WHERE recurring_rule_id = $1
            AND modification_type = 'one_time'
            AND (start_date = $2 OR override_txn_date = $2)
          ORDER BY
            CASE
              WHEN override_txn_date = $2 AND COALESCE(is_deleted, false) = false THEN 0
              WHEN override_txn_date = $2 THEN 1
              WHEN start_date = $2 AND COALESCE(is_deleted, false) = false THEN 2
              WHEN start_date = $2 THEN 3
              ELSE 4
            END,
            id DESC
          LIMIT 1
        `;
        const anchorLookup = await client.query(anchorLookupSql, [recurringRuleId, occurrenceDate]);
        const anchorStartDate = normalizeIsoDate(anchorLookup.rows?.[0]?.start_date) || occurrenceDate;

        const updateExistingSkipSql = `
          UPDATE recurring_modifications
          SET is_deleted = true,
              amount = NULL,
              description = NULL,
              account_id = NULL,
              category_id = NULL,
              override_txn_date = NULL,
              end_date = NULL
          WHERE recurring_rule_id = $1
            AND modification_type = 'one_time'
            AND start_date = $2
        `;
        const updateResult = await client.query(updateExistingSkipSql, [recurringRuleId, anchorStartDate]);
        if (Number(updateResult.rowCount || 0) === 0) {
          await client.query(
            `
              INSERT INTO recurring_modifications
                (recurring_rule_id, modification_type, start_date, end_date, amount, description, account_id, category_id, override_txn_date, is_deleted)
              VALUES ($1, 'one_time', $2, NULL, NULL, NULL, NULL, NULL, NULL, true)
            `,
            [recurringRuleId, anchorStartDate]
          );
        }

        const { rowCount } = await client.query("DELETE FROM transactions WHERE transfer_pair_id = $1", [pairId]);
        await client.query("COMMIT");
        return rowCount > 0;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    const { rowCount } = await query("DELETE FROM transactions WHERE transfer_pair_id = $1", [pairId]);
    return rowCount > 0;
  }

  const isGeneratedRecurring = Boolean(transaction.recurring_rule_id) && transaction.is_one_time === false;
  if (isGeneratedRecurring) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const recurringRuleId = Number(transaction.recurring_rule_id);
      const occurrenceDate = normalizeIsoDate(transaction.txn_date);
      const anchorLookupSql = `
        SELECT start_date
        FROM recurring_modifications
        WHERE recurring_rule_id = $1
          AND modification_type = 'one_time'
          AND (start_date = $2 OR override_txn_date = $2)
        ORDER BY
          CASE
            WHEN override_txn_date = $2 AND COALESCE(is_deleted, false) = false THEN 0
            WHEN override_txn_date = $2 THEN 1
            WHEN start_date = $2 AND COALESCE(is_deleted, false) = false THEN 2
            WHEN start_date = $2 THEN 3
            ELSE 4
          END,
          id DESC
        LIMIT 1
      `;
      const anchorLookup = await client.query(anchorLookupSql, [recurringRuleId, occurrenceDate]);
      const anchorStartDate = normalizeIsoDate(anchorLookup.rows?.[0]?.start_date) || occurrenceDate;

      const updateExistingSkipSql = `
        UPDATE recurring_modifications
        SET is_deleted = true,
            amount = NULL,
            description = NULL,
            account_id = NULL,
            category_id = NULL,
            override_txn_date = NULL,
            end_date = NULL
        WHERE recurring_rule_id = $1
          AND modification_type = 'one_time'
          AND start_date = $2
      `;
      const updateResult = await client.query(updateExistingSkipSql, [recurringRuleId, anchorStartDate]);

      if (Number(updateResult.rowCount || 0) === 0) {
        const insertSkipSql = `
          INSERT INTO recurring_modifications
            (recurring_rule_id, modification_type, start_date, end_date, amount, description, account_id, category_id, override_txn_date, is_deleted)
          VALUES ($1, 'one_time', $2, NULL, NULL, NULL, NULL, NULL, NULL, true)
        `;
        await client.query(insertSkipSql, [recurringRuleId, anchorStartDate]);
      }

      const { rowCount } = await client.query("DELETE FROM transactions WHERE id = $1", [id]);
      await client.query("COMMIT");
      return rowCount > 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  
  const { rowCount } = await query("DELETE FROM transactions WHERE id = $1", [id]);
  return rowCount > 0;
}

export async function setTransactionCleared(id, cleared) {
  const { rows: existingRows } = await query("SELECT id, txn_date, transfer_pair_id FROM transactions WHERE id = $1", [id]);
  const existing = existingRows[0];
  if (!existing) return null;
  ensureClearedRule(existing.txn_date, cleared);

  if (existing.transfer_pair_id) {
    // Sync cleared state on both legs of the transfer
    const { rows } = await query(
      "UPDATE transactions SET cleared = $1 WHERE transfer_pair_id = $2 RETURNING *",
      [Boolean(cleared), existing.transfer_pair_id]
    );
    return rows.find((r) => String(r.id) === String(id)) || rows[0];
  }

  const { rows } = await query(
    "UPDATE transactions SET cleared = $1 WHERE id = $2 RETURNING *",
    [Boolean(cleared), id]
  );
  return rows[0];
}
