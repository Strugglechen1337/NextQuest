import hashlib
import tempfile
import unittest
from pathlib import Path

from gate import create_app


class PinGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        salt = b"fixture-only-salt"
        self.auth = {
            "pin_salt": salt.hex(),
            "pin_hash": hashlib.scrypt(b"fixture-only-pin", salt=salt, n=2**14, r=8, p=1, dklen=32).hex(),
            "session_secret": "fixture-only-session-secret-0123456789",
        }
        self.host = "nextquest.test:7916"
        self.origin = "http://" + self.host
        app = create_app(self.auth, rate_path=Path(self.temp.name) / "rate.sqlite3", hosts={self.host})
        app.testing = True
        self.client = app.test_client()

    def verify(self, **extra):
        headers = {"Host": self.host, "X-Client-IP": "192.168.2.50", "X-Forwarded-Uri": "/", **extra}
        return self.client.get("/_auth/verify", headers=headers)

    def login(self, pin, **extra):
        page = self.client.get("/_auth/login?next=%2F", headers={"Host": self.host})
        csrf = page.get_data(as_text=True).split("name=csrf value='")[1].split("'")[0]
        headers = {"Host": self.host, "Origin": self.origin, **extra}
        return self.client.post("/_auth/login", data={"pin": pin, "csrf": csrf, "next": "/"}, headers=headers)

    def test_login_brand(self):
        page = self.client.get("/_auth/login", headers={"Host": self.host}).get_data(as_text=True)
        self.assertIn("<h1>NextQuest</h1>", page)

    def test_login_then_authenticated_verify(self):
        self.assertEqual(self.verify().status_code, 302)
        response = self.login("fixture-only-pin")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(self.verify().status_code, 204)
        self.assertIn("HttpOnly", response.headers.get("Set-Cookie", ""))
        self.assertIn("SameSite=Strict", response.headers.get("Set-Cookie", ""))

    def test_wrong_pin_and_rate_limit(self):
        for _ in range(5):
            response = self.login("wrong")
        self.assertEqual(response.status_code, 401)
        response = self.login("fixture-only-pin")
        self.assertEqual(response.status_code, 429)

    def test_external_source_and_cross_site_rejected(self):
        self.assertEqual(self.verify(**{"X-Client-IP": "203.0.113.9"}).status_code, 403)
        self.assertEqual(self.verify(Origin="http://evil.example").status_code, 403)
        self.assertEqual(self.verify(**{"Sec-Fetch-Site": "cross-site"}).status_code, 403)

    def test_open_redirect_is_removed(self):
        response = self.client.get("/_auth/verify", headers={
            "Host": self.host, "X-Client-IP": "192.168.2.50",
            "X-Forwarded-Uri": "//evil.example/path",
        })
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.headers["Location"].startswith("/_auth/login?next=/"))
        self.assertNotIn("evil.example", response.headers["Location"])

    def test_write_requires_same_origin(self):
        headers = {"Host": self.host, "X-Client-IP": "192.168.2.50",
                   "X-Forwarded-Method": "POST", "X-Forwarded-Uri": "/api/v1/spool"}
        self.assertEqual(self.client.get("/_auth/verify", headers=headers).status_code, 403)
        self.assertEqual(self.client.get("/_auth/verify", headers={**headers, "Origin": self.origin}).status_code, 302)


if __name__ == "__main__":
    unittest.main()
