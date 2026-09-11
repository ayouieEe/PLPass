# Catalog fingerprint specification

## Purpose

Future tooling compares an approved canonical manifest with a database catalog
without reading application rows. The result is a deterministic structural
fingerprint used to stop unsafe migrations, not to repair drift automatically.

## Included metadata

- schema, object name, and object type;
- normalized columns: name, ordinal position, SQL type, nullability, and
  normalized default expression;
- primary, foreign, unique, and check constraints, including FK update/delete
  actions;
- index method, key/expression list, uniqueness, predicate, and normalized
  definition;
- view definition and security mode where applicable;
- function identity arguments, return type, language, volatility, security
  mode, fixed search path, normalized definition, and execute grants;
- trigger table, timing, events, enabled state, and normalized definition;
- RLS enabled/forced state and normalized policy command, roles, `USING`, and
  `WITH CHECK` expressions;
- table/function grants for `anon`, `authenticated`, `service_role`, and
  `PUBLIC`;
- storage bucket metadata and storage policies when safely available.

## Explicit exclusions

Never read or hash table rows, storage objects, identities, attendance values,
emails, credentials, tokens, face embeddings, face descriptors, secrets,
volatile object IDs, table statistics, timestamps, replication state, or query
performance data.

## Normalization rules

1. Sort all arrays by schema, object type, object name, and then stable key.
2. Lowercase unquoted identifiers; retain quoted identifiers exactly.
3. Normalize whitespace, redundant parentheses, and line endings in SQL
   expressions without changing quoted literals.
4. Compare qualified object names, not OIDs, owner IDs, relation filenodes, or
   generated constraint IDs.
5. Normalize equivalent default casts and `search_path` representation.
6. Represent grants as sorted `(object, grantee, privilege)` tuples.
7. Represent policies as sorted `(table, name, command, roles, using,
   withCheck)` tuples.
8. Report an object-level diff before any aggregate fingerprint mismatch.

## Required stop conditions

Stop and require review if the catalog contains a forbidden session object,
lacks a required event-session relationship, changes an RPC identity/return
type/security mode, changes an RLS policy/grant, or differs from the approved
fingerprint in a non-normalized field.

The tool may report differences. It must never issue DDL, DML, migration repair,
or history writes.
