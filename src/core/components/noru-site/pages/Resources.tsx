import { ContactForm } from "../components/ContactForm";
import { SplitPage, type SplitSection } from "../components/SplitPage";

const SECTIONS: SplitSection[] = [
  {
    id: "about",
    icon: "about",
    title: "About Us",
    body: (
      <div>
        <p>Noru Digital Solutions is an all-in-one hospitality technology provider.</p>
        <div className="ph">Company background, mission and vision statement go here.</div>
      </div>
    ),
  },
  {
    id: "blogs",
    icon: "blogs",
    title: "Blogs",
    body: (
      <div>
        <p>Articles related to hospitality management trends, product updates, and industry insights.</p>
        <div className="g4">
          <div className="ph">Article</div>
          <div className="ph">Article</div>
          <div className="ph">Article</div>
        </div>
      </div>
    ),
  },
  {
    id: "testimonials",
    icon: "testimonials",
    title: "Testimonials",
    body: (
      <div>
        <p>Quotes and case studies from hotels, restaurants, and resorts currently using the platform.</p>
        <div className="g4">
          <div className="ph">Hotel quote</div>
          <div className="ph">Restaurant quote</div>
          <div className="ph">Resort quote</div>
        </div>
      </div>
    ),
  },
  {
    id: "contact",
    icon: "contact",
    title: "Contact Us",
    lead: "Submissions are routed to the company's official email inbox.",
    body: <ContactForm />,
  },
];

export function Resources({ anchor }: { anchor?: string | undefined }) {
  return <SplitPage page="resources" sections={SECTIONS} anchor={anchor} />;
}
