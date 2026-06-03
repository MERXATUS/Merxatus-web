-- MinionJobType: 모험가 (Postgres: enum 값은 별도 트랜잭션에서 먼저 커밋되어야 함)
ALTER TYPE "MinionJobType" ADD VALUE IF NOT EXISTS 'ADVENTURER';
