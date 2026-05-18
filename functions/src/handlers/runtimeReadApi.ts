/**
 * Runtime Read API — read-only surface for the Edge AI Chatbot Runtime.
 *
 * One callable function (`runtimeReadApi`) that dispatches on `intent`. The
 * Runtime calls this with a service-account JWT + the ImportFlow organizationId
 * (mapped from the Runtime's tenant_id ↔ orgId table).
 *
 * Auth model (TODO — currently a stub):
 *   1. Request must be authenticated as the Runtime service account
 *      (Firebase Auth custom token issued to a dedicated service-account user).
 *   2. The orgId passed in args must be in the service account's allowed list,
 *      OR the service account must hold a 'runtime:read' custom claim.
 *
 * Data model assumption:
 *   - Orders live at /organizations/{orgId}/orders/{orderId}
 *     (the path the frontend writes to in OrderManagement.tsx)
 *
 * Box-out reference: plans/2026-05-16-importflow-chatbot-assistant-boxout.md
 */

import {onCall, HttpsError, CallableRequest} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";

// ── Types ─────────────────────────────────────────────────────────────────────

type Intent =
  | "getOrderByPackage"
  | "getOrdersByConsignee"
  | "getOrdersByPhone"
  | "listOrders"
  | "getOrderStatus"
  | "summarizeOrders";

interface BaseArgs {
  orgId: string;
}

interface GetOrderByPackageArgs extends BaseArgs {
  packageNumber: string;
}
interface GetOrdersByConsigneeArgs extends BaseArgs {
  consignee: string;
  sinceISO?: string;
}
interface GetOrdersByPhoneArgs extends BaseArgs {
  e164: string;
}
interface ListOrdersArgs extends BaseArgs {
  status?: string;
  sinceISO?: string;
  untilISO?: string;
  limit?: number;
  cursor?: string;
}
interface GetOrderStatusArgs extends BaseArgs {
  packageNumber: string;
}
interface SummarizeOrdersArgs extends BaseArgs {
  sinceISO: string;
}

// ── Auth (stub) ───────────────────────────────────────────────────────────────

function assertRuntimeCaller(req: CallableRequest): void {
  // TODO: replace with real Runtime service-account verification.
  // For now: require ANY authenticated caller + a magic header asserting Runtime.
  // The actual production check will validate a 'runtime:read' custom claim
  // issued by the Runtime's Firebase service account.
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const claims = req.auth.token as Record<string, unknown>;
  const isRuntime = claims["runtime"] === true || claims["service"] === "edge-ai-chatbot-runtime";
  if (!isRuntime) {
    // Soft-fail during scaffolding — log instead of reject so wiring can be tested.
    console.warn(
      `[runtimeReadApi] caller ${req.auth.uid} lacks Runtime claim — allowing during scaffold phase. ` +
      `Lock down before production cutover.`
    );
  }
}

function assertOrgAccess(req: CallableRequest, orgId: string): void {
  // TODO: check req.auth.token against a runtime_links / allowed_orgs claim.
  // Scaffold: log only.
  if (!orgId || typeof orgId !== "string") {
    throw new HttpsError("invalid-argument", "orgId is required.");
  }
  void req; // suppress unused warning while stub
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ordersRef = (orgId: string) =>
  getFirestore().collection("organizations").doc(orgId).collection("orders");

function toISOorNull(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof (v as {toDate?: () => Date}).toDate === "function") {
    return (v as {toDate: () => Date}).toDate().toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  return null;
}

function normalizeOrder(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    packageNumber: data.packageNumber ?? null,
    consignee: data.consignee ?? null,
    status: data.status ?? null,
    pieces: data.pieces ?? null,
    value: data.value ?? null,
    trackingNumber: data.trackingNumber ?? null,
    parcelComp: data.parcelComp ?? null,
    items: Array.isArray(data.items) ? data.items : [],
    date: data.date ?? null,
    createdAt: toISOorNull(data.createdAt),
    updatedAt: toISOorNull(data.updatedAt),
    customerReceivedDate: data.customerReceivedDate ?? null,
  };
}

// ── Intent handlers ───────────────────────────────────────────────────────────

async function getOrderByPackage(args: GetOrderByPackageArgs) {
  const {orgId, packageNumber} = args;
  if (!packageNumber) throw new HttpsError("invalid-argument", "packageNumber is required.");

  // packageNumber stored as either "Paquete #5" or "5" — match both
  const variants = [packageNumber, `Paquete #${packageNumber.replace(/[^\d]/g, "")}`];
  for (const v of variants) {
    const snap = await ordersRef(orgId).where("packageNumber", "==", v).limit(1).get();
    if (!snap.empty) return {order: normalizeOrder(snap.docs[0])};
  }
  return {order: null};
}

async function getOrdersByConsignee(args: GetOrdersByConsigneeArgs) {
  const {orgId, consignee, sinceISO} = args;
  if (!consignee) throw new HttpsError("invalid-argument", "consignee is required.");

  let q: FirebaseFirestore.Query = ordersRef(orgId);
  // case-insensitive prefix matching isn't native — store normalizedConsignee at write-time
  // for production. Scaffold uses exact + uppercase variants.
  const variants = Array.from(new Set([consignee, consignee.toUpperCase(), consignee.trim()]));
  const results: ReturnType<typeof normalizeOrder>[] = [];
  for (const v of variants) {
    const snap = await q.where("consignee", "==", v).get();
    for (const d of snap.docs) results.push(normalizeOrder(d));
  }

  let filtered = dedupeById(results);
  if (sinceISO) {
    filtered = filtered.filter((o) => (o.createdAt ?? "") >= sinceISO);
  }
  filtered.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return {orders: filtered};
}

async function getOrdersByPhone(args: GetOrdersByPhoneArgs) {
  const {e164} = args;
  if (!e164) throw new HttpsError("invalid-argument", "e164 is required.");

  // TODO: requires a contacts collection mapping phone → consignee. Once that exists,
  // query ordersRef(args.orgId) joined against contacts(e164). Scaffold returns empty
  // + a TODO marker so the Runtime knows to ask the user for a name instead.
  return {
    orders: [],
    note: "phone→consignee mapping not yet populated; ask for consignee name instead.",
  };
}

async function listOrders(args: ListOrdersArgs) {
  const {orgId, status, sinceISO, untilISO, limit = 50} = args;
  let q: FirebaseFirestore.Query = ordersRef(orgId);
  if (status) q = q.where("status", "==", status);
  q = q.orderBy("createdAt", "desc").limit(Math.min(limit, 200));

  const snap = await q.get();
  let orders = snap.docs.map(normalizeOrder);
  if (sinceISO) orders = orders.filter((o) => (o.createdAt ?? "") >= sinceISO);
  if (untilISO) orders = orders.filter((o) => (o.createdAt ?? "") <= untilISO);
  return {orders, count: orders.length};
}

async function getOrderStatus(args: GetOrderStatusArgs) {
  const {order} = await getOrderByPackage({orgId: args.orgId, packageNumber: args.packageNumber});
  if (!order) return {found: false};
  return {
    found: true,
    packageNumber: order.packageNumber,
    consignee: order.consignee,
    status: order.status,
    trackingNumber: order.trackingNumber,
    parcelComp: order.parcelComp,
    lastUpdate: order.updatedAt,
    customerReceivedDate: order.customerReceivedDate,
  };
}

async function summarizeOrders(args: SummarizeOrdersArgs) {
  const {orgId, sinceISO} = args;
  if (!sinceISO) throw new HttpsError("invalid-argument", "sinceISO is required.");

  const snap = await ordersRef(orgId).orderBy("createdAt", "desc").limit(500).get();
  const orders = snap.docs.map(normalizeOrder).filter((o) => (o.createdAt ?? "") >= sinceISO);

  const byStatus: Record<string, number> = {};
  const byConsignee: Record<string, {count: number; value: number}> = {};
  let totalValue = 0;
  for (const o of orders) {
    const s = o.status ?? "unknown";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
    const c = o.consignee ?? "unknown";
    byConsignee[c] = byConsignee[c] ?? {count: 0, value: 0};
    byConsignee[c].count += 1;
    byConsignee[c].value += o.value ?? 0;
    totalValue += o.value ?? 0;
  }
  return {
    count: orders.length,
    totalValue: Math.round(totalValue * 100) / 100,
    byStatus,
    byConsignee,
    sinceISO,
  };
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

function dedupeById<T extends {id: string}>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    if (!seen.has(x.id)) {
      seen.add(x.id);
      out.push(x);
    }
  }
  return out;
}

export const runtimeReadApi = onCall(
  {
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 20,
    cors: true,
  },
  async (request) => {
    assertRuntimeCaller(request);

    const {intent, args} = (request.data ?? {}) as {intent?: Intent; args?: BaseArgs};
    if (!intent) throw new HttpsError("invalid-argument", "intent is required.");
    if (!args || !args.orgId) throw new HttpsError("invalid-argument", "args.orgId is required.");

    assertOrgAccess(request, args.orgId);

    try {
      switch (intent) {
        case "getOrderByPackage":
          return await getOrderByPackage(args as GetOrderByPackageArgs);
        case "getOrdersByConsignee":
          return await getOrdersByConsignee(args as GetOrdersByConsigneeArgs);
        case "getOrdersByPhone":
          return await getOrdersByPhone(args as GetOrdersByPhoneArgs);
        case "listOrders":
          return await listOrders(args as ListOrdersArgs);
        case "getOrderStatus":
          return await getOrderStatus(args as GetOrderStatusArgs);
        case "summarizeOrders":
          return await summarizeOrders(args as SummarizeOrdersArgs);
        default:
          throw new HttpsError("invalid-argument", `Unknown intent: ${intent}`);
      }
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const message = (err as Error)?.message || String(err);
      console.error(`[runtimeReadApi] intent=${intent} orgId=${args.orgId} failed:`, message);
      throw new HttpsError("internal", message);
    }
  }
);
