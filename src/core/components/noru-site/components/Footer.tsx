import type { ReactNode } from "react";
import logo from "../assets/logo.png";
import { hrefFor, useRequestDemo } from "../lib/router";
import { useNoruSite } from "../site-context";

export function CtaBand() {
  const requestDemo = useRequestDemo();
  return (
    <section className="cta">
      <div className="w">
        <div>
          <h2>Ready to run your property on one platform?</h2>
          <p>Book a demo and see reservations, restaurant and back office working together.</p>
        </div>
        <a
          className="btn"
          href="#resources/contact"
          onClick={(e) => {
            e.preventDefault();
            requestDemo();
          }}
        >
          Request Demo
        </a>
      </div>
    </section>
  );
}

function Social({ label, children }: { label: string; children: ReactNode }) {
  return (
    <a href="#" aria-label={label} onClick={(e) => e.preventDefault()}>
      <svg viewBox="0 0 24 24">{children}</svg>
    </a>
  );
}

export function Footer() {
  const { products, solutions, footerContact } = useNoruSite();
  return (
    <footer>
      <div className="w">
        <div className="fg">
          <div>
            <div className="logo" style={{ color: "#fff" }}>
              <img src={logo} alt="" width={42} height={42} />
              Noru Digital Solutions
            </div>
            <p style={{ fontSize: ".92rem" }}>One Platform. Every Hotel Operation.</p>
            <div className="soc">
              <Social label="Facebook">
                <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1z" />
              </Social>
              <Social label="Instagram">
                <rect
                  x={3.5}
                  y={3.5}
                  width={17}
                  height={17}
                  rx={5}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                />
                <circle cx={12} cy={12} r={4} fill="none" stroke="currentColor" strokeWidth={2} />
                <circle cx={17.2} cy={6.8} r={1.2} />
              </Social>
              <Social label="LinkedIn">
                <rect x={4} y={9.5} width={3.4} height={10.5} />
                <circle cx={5.7} cy={5.8} r={2} />
                <path d="M10 9.5h3.2v1.5c.6-1 1.8-1.8 3.5-1.8 3 0 3.8 2 3.8 4.6V20h-3.4v-5.5c0-1.3-.2-2.3-1.6-2.3s-2 1-2 2.4V20H10z" />
              </Social>
              <Social label="X (Twitter)">
                <path d="M4 4h4.2l4.1 5.6L17.2 4H20l-6.4 7.3L20.5 20h-4.2l-4.4-6-5.2 6H4l6.8-7.7z" />
              </Social>
            </div>
          </div>
          <div>
            <h4>Products</h4>
            {products.map((p) => (
              <a key={p.id} href={hrefFor("product", p.id)}>
                {p.title}
              </a>
            ))}
          </div>
          <div>
            <h4>Solutions</h4>
            {solutions.map((s) => (
              <a key={s.id} href={hrefFor("solutions", s.id)}>
                {s.title}
              </a>
            ))}
          </div>
          <div>
            <h4>Resources</h4>
            <a href={hrefFor("resources", "about")}>About Us</a>
            <a href={hrefFor("resources", "blogs")}>Blogs</a>
            <a href={hrefFor("resources", "testimonials")}>Testimonials</a>
            <a href={hrefFor("resources", "contact")}>Contact Us</a>
          </div>
          <div>
            <h4>Contact Info</h4>
            <span>{footerContact.email}</span>
            <br />
            <span>{footerContact.phone}</span>
            <br />
            <span>{footerContact.address}</span>
          </div>
        </div>
        <div className="bb">
          <span>© Noru Digital Solutions. All rights reserved.</span>
          <span>
            <a href="#" onClick={(e) => e.preventDefault()}>
              Privacy Policy
            </a>
            <a href="#" onClick={(e) => e.preventDefault()}>
              Terms of Service
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
