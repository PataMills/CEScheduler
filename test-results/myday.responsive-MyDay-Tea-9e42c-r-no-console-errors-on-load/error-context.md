# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]: 👤 Sales User
    - generic [ref=e5]: sales@cabinetsexpress.com
    - navigation [ref=e6]:
      - link "Logout" [ref=e7] [cursor=pointer]:
        - /url: /logout
  - generic [ref=e8]:
    - heading "Sign in" [level=1] [ref=e9]
    - generic [ref=e10]: Email
    - textbox "you@company.com" [ref=e11]
    - generic [ref=e12]: Password
    - textbox "••••••••" [ref=e13]
    - button "Login" [ref=e14] [cursor=pointer]
    - generic [ref=e15]:
      - text: Don't have an account?
      - link "Create one" [ref=e16] [cursor=pointer]:
        - /url: /register
```