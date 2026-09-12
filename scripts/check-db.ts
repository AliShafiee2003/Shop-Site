import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const models = ['user','product','category','order','article','homePageVersion','cart'];
  for (const m of models) {
    try { console.log(m + ':', await (db as unknown as Record<string, { count: () => Promise<number> }>)[m].count()); } catch { console.log(m + ': ERR'); }
  }
}
main().finally(() => db.$disconnect());
