-- CreateTable
CREATE TABLE "MinionInventory" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "owned" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MinionInventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
