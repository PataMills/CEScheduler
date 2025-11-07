import { promises as fs } from "fs";
import path from "path";

const root = process.cwd();

async function getFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await getFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

function detectExport(content) {
  const defaultFn = content.match(/export\s+default\s+function\s+([\w$]+)/);
  if (defaultFn) return `default function ${defaultFn[1]}(app)`;
  const routerConst = content.match(/const\s+(\w+)\s*=\s*Router\(/);
  if (routerConst && content.includes("export default")) return `express.Router (${routerConst[1]})`;
  if (content.includes("module.exports")) return "CommonJS";
  return "unknown";
}

function extractEndpoints(content) {
  const matches = [];
  const regex = /(app|router|api|teamsRouter|teamTasksRoutes|regRouter)\.(get|post|put|delete|patch|options|head)\(\s*(["'`])([^"'`]+)\3/gi;
  let m;
  while ((m = regex.exec(content))) {
    matches.push(`${m[2].toUpperCase()} ${m[4]}`);
  }
  return Array.from(new Set(matches));
}

function extractQueries(content) {
  const queries = [];
  const regex = /pool\.query\(([`"'])([\s\S]*?)\1/g;
  let m;
  while ((m = regex.exec(content))) {
    const sql = m[2].split("\n").map(s => s.trim()).filter(Boolean).slice(0,3).join(" ");
    queries.push(sql.slice(0,120));
  }
  return queries;
}

const routesDir = path.join(root, "routes");
const pagesDir = path.join(root, "pages");

const routes = await getFiles(routesDir);
const pages = await getFiles(pagesDir);

const routeData = [];
for (const file of routes) {
  const text = await fs.readFile(file, "utf8");
  routeData.push({
    file: path.relative(root, file).replace(/\\/g,"/"),
    exportType: detectExport(text),
    endpoints: extractEndpoints(text)
  });
}

const pageData = [];
for (const file of pages) {
  const text = await fs.readFile(file, "utf8");
  pageData.push({
    file: path.relative(root, file).replace(/\\/g,"/"),
    exportType: detectExport(text),
    endpoints: extractEndpoints(text)
  });
}

const dbImports = [];
const filesToScan = [...routes, ...pages, path.join(root, "app.js"), path.join(root, "db.js")];
for (const file of filesToScan) {
  const text = await fs.readFile(file, "utf8");
  if (/from\s+["'`]\.\.\/db\.js["'`]/.test(text) || /from\s+["'`].\/db\.js["'`]/.test(text)) {
    dbImports.push(path.relative(root, file).replace(/\\/g,"/"));
  }
}

const poolInstantiations = [];
for (const file of filesToScan) {
  const text = await fs.readFile(file, "utf8");
  if (/new\s+Pool\s*\(/.test(text) && !file.endsWith("db.js")) {
    poolInstantiations.push(path.relative(root, file).replace(/\\/g,"/"));
  }
}

const queryMap = [];
for (const file of filesToScan) {
  const text = await fs.readFile(file, "utf8");
  if (!/pool\.query\(/.test(text)) continue;
  const queries = extractQueries(text);
  if (queries.length) {
    queryMap.push({
      file: path.relative(root, file).replace(/\\/g,"/"),
      queries
    });
  }
}

const commonJsFiles = [];
for (const file of [...routes, ...pages, path.join(root, "app.js"), path.join(root, "db.js")]) {
  const text = await fs.readFile(file, "utf8");
  if (/module\.exports|require\(/.test(text)) {
    commonJsFiles.push(path.relative(root, file).replace(/\\/g,"/"));
  }
}

console.log(JSON.stringify({ routeData, pageData, dbImports, poolInstantiations, queryMap, commonJsFiles }, null, 2));
