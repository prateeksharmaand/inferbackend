import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScoreBadge, StatusBadge } from "@/components/badges";
import { ChipsInput } from "@/components/ui/misc";
import { JobCard } from "@/features/jobs/job-card";
import type { Job } from "@/types/api";

const job: Job = {
  id: 7, title: "Flutter Technical Lead", company_name: "Acme", company_id: 1, location: "Bengaluru", work_mode: "hybrid",
  ctc_min_lpa: 30, ctc_max_lpa: 40, currency: "INR", salary_text: "", experience_min_years: 8, experience_max_years: 12,
  url: "https://acme.example/jobs/7", apply_url: null, posted_at: new Date().toISOString(), discovered_at: new Date().toISOString(),
  last_verified_at: null, status: "active", is_manual: false, source_key: "jsearch", source_name: "JSearch (LinkedIn · Indeed)",
  shortlisted_at: null, dismissed_at: null, archived_at: null, skills: ["Flutter"],
  match: { overall_score: 88, classification: "Excellent Match", explanation: "Strong Flutter overlap", reasons_to_apply: [], model: "claude-opus-5-5" },
  application_id: null, application_status: null,
};

function wrap(ui: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe("components", () => {
  it("ScoreBadge shows score with accessible label, or 'Not scored'", () => {
    render(<><ScoreBadge score={88} /><ScoreBadge score={null} /></>);
    expect(screen.getByLabelText("Match score 88 of 100")).toHaveTextContent("88");
    expect(screen.getByText("Not scored")).toBeInTheDocument();
  });

  it("StatusBadge humanises status", () => {
    render(<StatusBadge status="technical_interview" />);
    expect(screen.getByText("Technical Interview")).toBeInTheDocument();
  });

  it("JobCard renders all required fields and opens details", async () => {
    const onOpen = vi.fn();
    wrap(<JobCard job={job} onOpen={onOpen} />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Bengaluru")).toBeInTheDocument();
    expect(screen.getByText("₹30–40 LPA")).toBeInTheDocument();
    expect(screen.getByText("Hybrid")).toBeInTheDocument();
    expect(screen.getByText("JSearch")).toBeInTheDocument();
    expect(screen.getByText(/Posted/)).toBeInTheDocument();
    expect(screen.getByText("Strong Flutter overlap")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Apply link/ })).toHaveAttribute("href", job.url);
    expect(screen.getByRole("button", { name: /Shortlist/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate resume/ })).toBeInTheDocument();
    await userEvent.click(screen.getByText("Flutter Technical Lead"));
    expect(onOpen).toHaveBeenCalledWith(7);
  });

  it("ChipsInput adds on Enter and removes", async () => {
    const onChange = vi.fn();
    render(<ChipsInput value={["Pune"]} onChange={onChange} placeholder="Add location" />);
    await userEvent.type(screen.getByLabelText("Add location"), "Jaipur{Enter}");
    expect(onChange).toHaveBeenCalledWith(["Pune", "Jaipur"]);
    await userEvent.click(screen.getByLabelText("Remove Pune"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
