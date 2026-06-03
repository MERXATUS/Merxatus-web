-- User.usernameChosen: 기존 유저는 true로 간주, 신규만 false로 생성
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "usernameChosen" BOOLEAN NOT NULL DEFAULT true;

