import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const models = ['user','product','category','order','article','homePageVersion','cart'];
  for (const m of models) {
    try { console.log(m + ':', await (db as any)[m].count()); } catch (e) { console.log(m + ': ERR'); }
  }
}
main().finally(() => db.$disconnect());
