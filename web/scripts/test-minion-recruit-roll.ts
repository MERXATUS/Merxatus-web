import { rollRecruitCandidates } from "../src/server/minionRecruit";



async function main() {

  const r = await rollRecruitCandidates("item_minion_ticket", { category: "GATHER" });

  console.log(

    JSON.stringify({

      itemId: r.ticket.itemId,

      pickCount: r.ticket.pickCount,

      candidates: r.candidates,

      kind: r.minionKind,

    }),

  );

}



main().catch((e) => {

  console.error(e);

  process.exit(1);

});

