import { test as base, type Page } from "@playwright/test";

/**
 * 인증 상태를 mock하는 fixture.
 * localStorage에 JWT 토큰과 사용자 정보를 주입하여 인증된 상태를 시뮬레이션합니다.
 */

const MOCK_PROFESSOR = {
  id: "test-prof-001",
  email: "prof@test.ac.kr",
  name: "테스트 교수",
  role: "professor",
  school: "한국대학교",
  department: "컴퓨터공학과",
};

const MOCK_STUDENT = {
  id: "test-stu-001",
  email: "stu@test.ac.kr",
  name: "테스트 학생",
  role: "student",
  school: "한국대학교",
  department: "컴퓨터공학과",
  student_number: "20240001",
};

// JWT payload는 실제로 검증되지 않으므로 형식만 맞춘 더미 토큰
const MOCK_ACCESS_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXByb2YtMDAxIiwicm9sZSI6InByb2Zlc3NvciIsImV4cCI6OTk5OTk5OTk5OX0.mock";
const MOCK_REFRESH_TOKEN = "mock-refresh-token";

async function injectAuth(page: Page, user: typeof MOCK_PROFESSOR | typeof MOCK_STUDENT) {
  await page.addInitScript(
    ({ accessToken, refreshToken, user }) => {
      localStorage.setItem("access_token", accessToken);
      localStorage.setItem("refresh_token", refreshToken);
      localStorage.setItem("user", JSON.stringify(user));
    },
    { accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN, user },
  );
}

type AuthFixtures = {
  professorPage: Page;
  studentPage: Page;
};

export const test = base.extend<AuthFixtures>({
  professorPage: async ({ page }, use) => {
    await injectAuth(page, MOCK_PROFESSOR);
    await use(page);
  },
  studentPage: async ({ page }, use) => {
    await injectAuth(page, MOCK_STUDENT);
    await use(page);
  },
});

export { expect } from "@playwright/test";
export { MOCK_PROFESSOR, MOCK_STUDENT };
