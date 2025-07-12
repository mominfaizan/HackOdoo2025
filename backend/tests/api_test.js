const request = require("supertest");
const app = require("../src/index");
let authToken;

describe("API Endpoints", () => {
  beforeAll(async () => {
    // Sign up test user
    await request(app).post("/auth/signup").send({
      email: "test@example.com",
      password: "test123",
      name: "Test User",
    });
  });

  it("should login user", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "test@example.com",
      password: "test123",
    });
    authToken = res.body.token;
    expect(res.statusCode).toEqual(200);
  });

  it("should create a post", async () => {
    const res = await request(app)
      .post("/posts")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        title: "Test Question",
        content: "How to test?",
        isQuestion: true,
        tags: ["testing"],
      });
    expect(res.statusCode).toEqual(200);
  });
});
