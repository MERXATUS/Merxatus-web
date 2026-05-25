#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const CANVAS_PATH = path.join(
  PROJECT_ROOT,
  "..",
  ".cursor",
  "projects",
  "c-Users-yj030-My-project-3",
  "canvases",
  "merxatus-items-recipes.canvas.tsx",
);

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function getChangedPaths(payload) {
  // Cursor hook payload shape can vary across versions; probe common fields.
  const candidates = [];
  const push = (v) => {
    if (!v) return;
    if (Array.isArray(v)) v.forEach(push);
    else if (typeof v === "string") candidates.push(v);
    else if (typeof v === "object") {
      if (typeof v.path === "string") candidates.push(v.path);
      if (typeof v.filePath === "string") candidates.push(v.filePath);
      if (typeof v.uri === "string") candidates.push(v.uri);
    }
  };
  push(payload?.path);
  push(payload?.filePath);
  push(payload?.files);
  push(payload?.editedFiles);
  push(payload?.tool_output?.editedFiles);
  push(payload?.arguments?.path);
  push(payload?.arguments?.filePath);
  return candidates;
}

function normalizeFsPath(p) {
  if (!p) return "";
  // handle file:// URIs
  if (p.startsWith("file://")) {
    try {
      p = decodeURIComponent(p.slice("file://".length));
      if (p.startsWith("/")) p = p.slice(1);
    } catch {
      /* ignore */
    }
  }
  return p.replaceAll("\\", "/");
}

function shouldRegenerate(changedPaths) {
  const targets = new Set([
    "web/data/items.json",
    "web/data/recipes.json",
    "web/data/workshops.json",
  ]);
  for (const p of changedPaths) {
    const n = normalizeFsPath(p);
    for (const t of targets) {
      if (n.endsWith(`/${t}`) || n.endsWith(t)) return true;
    }
  }
  return false;
}

function loadJson(rel) {
  const abs = path.join(PROJECT_ROOT, rel);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function tsStringify(obj) {
  return JSON.stringify(obj, null, 2);
}

function generateCanvas({ items, recipes }) {
  const src = `import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Select,
  Stack,
  Stat,
  Table,
  Text,
  TextInput,
  Toggle,
  useCanvasState,
} from "cursor/canvas";

type ItemRow = {
  id: string;
  name: string;
  category: string;
  tradable: boolean;
  grade?: number;
};

type RecipeIO = {
  itemId: string;
  quantity?: number;
  minQty?: number;
  maxQty?: number;
  weight?: number;
};

type RecipeRow = {
  workshopName: string;
  name: string;
  inputs: Array<{ itemId: string; quantity: number }>;
  outputs: Array<RecipeIO>;
  rewardGold?: number;
};

const ITEMS: ItemRow[] = ${tsStringify(items)};
const RECIPES: RecipeRow[] = ${tsStringify(recipes)};

function gradeLabel(grade?: number) {
  return grade ? \`G\${grade}\` : "—";
}

function fmtIO(io: RecipeIO, nameById: Map<string, string>) {
  const nm = nameById.get(io.itemId) ?? io.itemId;
  const qty =
    typeof io.quantity === "number"
      ? \`x\${io.quantity}\`
      : typeof io.minQty === "number" && typeof io.maxQty === "number"
        ? io.minQty === io.maxQty
          ? \`x\${io.minQty}\`
          : \`x\${io.minQty}~\${io.maxQty}\`
        : "";
  const weight = typeof io.weight === "number" ? \` (w\${io.weight})\` : "";
  return \`\${nm}\${qty}\${weight}\`;
}

function includesQ(hay: string, q: string) {
  if (!q) return true;
  return hay.toLowerCase().includes(q.toLowerCase());
}

export default function MerxatusItemsAndRecipes() {
  const [tab, setTab] = useCanvasState<"materials" | "recipes">("tab", "materials");
  const [query, setQuery] = useCanvasState<string>("query", "");
  const [showAllItems, setShowAllItems] = useCanvasState<boolean>("showAllItems", false);

  const nameById = new Map(ITEMS.map((it) => [it.id, it.name] as const));
  const materials = ITEMS.filter((x) => x.category === "재료");

  const itemRows = (showAllItems ? ITEMS : materials)
    .filter((x) => includesQ(\`\${x.id} \${x.name} \${x.category} \${x.grade ?? ""}\`, query))
    .sort((a, b) => ((a.grade ?? 999) - (b.grade ?? 999)) || a.name.localeCompare(b.name, "ko"));

  const recipeRows = RECIPES.filter((r) => {
    const inS = r.inputs.map((x) => fmtIO(x, nameById)).join(", ");
    const outS = (r.outputs ?? []).map((x) => fmtIO(x, nameById)).join(", ");
    return includesQ(\`\${r.workshopName} \${r.name} \${inS} \${outS}\`, query);
  });

  let missingItemIds = 0;
  for (const r of RECIPES) {
    for (const io of r.inputs) if (!nameById.has(io.itemId)) missingItemIds++;
    for (const io of r.outputs ?? []) if (!nameById.has(io.itemId)) missingItemIds++;
  }

  return (
    <Stack gap={18}>
      <Row align="center" justify="space-between">
        <Stack gap={4}>
          <H1>Merxatus 데이터 표</H1>
          <Text tone="secondary" size="small">
            \`web/data/items.json\`, \`web/data/recipes.json\` 저장 시 캔버스가 자동 갱신됩니다.
          </Text>
        </Stack>
        <Pill tone="info" size="lg">
          자동 최신화
        </Pill>
      </Row>

      <Grid columns={4} gap={12}>
        <Stat value={\`\${ITEMS.length}\`} label="아이템(전체)" />
        <Stat value={\`\${materials.length}\`} label="재료" />
        <Stat value={\`\${RECIPES.length}\`} label="레시피" />
        <Stat value={\`\${missingItemIds}\`} label="아이템ID 누락(IO)" tone={missingItemIds ? "warning" : undefined} />
      </Grid>

      {missingItemIds ? (
        <Callout tone="warning" title="레시피에 정의되지 않은 itemId가 있어요">
          <Text>
            \`recipes.json\`의 inputs/outputs에 있지만 \`items.json\`에는 없는 itemId가 있습니다. 표에서는 itemId 그대로 표시됩니다.
          </Text>
        </Callout>
      ) : null}

      <Card>
        <CardHeader
          title="필터"
          subtitle="탭 선택 → 검색"
          trailing={
            <Row align="center" gap={12}>
              <Select
                value={tab}
                options={[
                  { value: "materials", label: "재료/아이템" },
                  { value: "recipes", label: "레시피" },
                ]}
                onChange={(v) => setTab(v)}
              />
              {tab === "materials" ? (
                <Row align="center" gap={8}>
                  <Text tone="secondary" size="small">
                    전체 아이템
                  </Text>
                  <Toggle value={!!showAllItems} onChange={(v) => setShowAllItems(v)} />
                </Row>
              ) : null}
            </Row>
          }
        />
        <CardBody>
          <TextInput value={query} placeholder="검색 (예: 돌 / item_stone / 대장간 / G3)" onChange={(v) => setQuery(v)} />
          <Row align="center" gap={10} style={{ marginTop: 10 }}>
            <Pill tone="info">정렬: 등급 오름차순</Pill>
            <Pill tone="neutral">표 클릭/복사 가능</Pill>
          </Row>
        </CardBody>
      </Card>

      <Divider />

      {tab === "materials" ? (
        <Stack gap={10}>
          <Row align="center" justify="space-between">
            <H2>재료/아이템</H2>
            <Text tone="secondary" size="small">
              {showAllItems ? "전체 아이템" : "재료만"} · {itemRows.length}건
            </Text>
          </Row>
          <Table
            headers={["이름", "ID", "카테고리", "등급", "거래"]}
            rows={itemRows.map((x) => [x.name, x.id, x.category, gradeLabel(x.grade), x.tradable ? "가능" : "불가"])}
            columnAlign={["left", "left", "left", "right", "left"]}
          />
        </Stack>
      ) : (
        <Stack gap={10}>
          <Row align="center" justify="space-between">
            <H2>레시피</H2>
            <Text tone="secondary" size="small">
              {recipeRows.length}건
            </Text>
          </Row>
          <Table
            headers={["작업장", "레시피", "입력", "출력", "보상(G)"]}
            rows={recipeRows.map((r) => {
              const inputs = r.inputs.map((x) => fmtIO(x, nameById)).join(", ");
              const outputs = (r.outputs ?? []).map((x) => fmtIO(x, nameById)).join(", ");
              const reward = r.rewardGold ? String(r.rewardGold) : "0";
              return [r.workshopName, r.name, inputs || "—", outputs || "—", reward];
            })}
            columnAlign={["left", "left", "left", "left", "right"]}
          />
        </Stack>
      )}
    </Stack>
  );
}
`;
  return src;
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function main() {
  const raw = readStdin();
  const payload = safeJsonParse(raw) ?? {};
  const changedPaths = getChangedPaths(payload);

  if (!shouldRegenerate(changedPaths)) {
    // No-op
    process.stdout.write(JSON.stringify({ ok: true, skipped: true }) + "\n");
    return;
  }

  const items = loadJson("web/data/items.json");
  const recipes = loadJson("web/data/recipes.json");

  const out = generateCanvas({ items, recipes });
  ensureDir(CANVAS_PATH);
  fs.writeFileSync(CANVAS_PATH, out, "utf8");

  process.stdout.write(JSON.stringify({ ok: true, regenerated: true, canvasPath: CANVAS_PATH }) + "\n");
}

main();

