import React, { useState } from "react";
import { Sparkles, MapPin, Users, DollarSign, Layers } from "lucide-react";
import type { CreateResearchJobInput } from "@/types/domain";

interface EventDetailsFormProps {
  onSubmit: (input: CreateResearchJobInput) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export function EventDetailsForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: EventDetailsFormProps) {
  const [formData, setFormData] = useState<CreateResearchJobInput>({
    event_name: "",
    event_type: "hackathon",
    event_theme: "",
    event_description: "",
    venue_city: "",
    venue_state: "",
    venue_name: "",
    event_format: "in_person",
    start_date: "",
    end_date: "",
    expected_footfall: undefined,
    primary_audience: "",
    audience_age_range: "18-24",
    academic_disciplines: "",
    institution_name: "",
    budget_target_inr: undefined,
    support_types_needed: ["cash", "cloud_credits"],
    sponsorship_tiers: "",
    sponsor_benefits: "",
    previous_sponsors_hint: "",
    additional_notes: "",
  });

  const [activeTab, setActiveTab] = useState<"overview" | "audience" | "sponsorship">("overview");

  const supportTypeOptions = [
    { value: "cash", label: "Cash Grant" },
    { value: "cloud_credits", label: "Cloud Credits / API Grants" },
    { value: "prizes", label: "Prizes & Hardware Gadgets" },
    { value: "food", label: "Food & Beverage" },
    { value: "merchandise", label: "T-Shirts & Swag" },
    { value: "other", label: "Venue / Marketing" },
  ];

  const handleToggleSupportType = (val: string) => {
    const current = formData.support_types_needed || [];
    if (current.includes(val)) {
      setFormData({ ...formData, support_types_needed: current.filter((x) => x !== val) });
    } else {
      setFormData({ ...formData, support_types_needed: [...current, val] });
    }
  };

  const loadExamplePreset = (type: "hackathon" | "fest" | "summit") => {
    if (type === "hackathon") {
      setFormData({
        event_name: "CodeStorm Hackathon 2026",
        event_type: "hackathon",
        event_theme: "Generative AI, Web3 & Sustainable Tech",
        event_description: "A 36-hour national college hackathon bringing together top student developers and creators.",
        venue_city: "Bengaluru",
        venue_state: "Karnataka",
        venue_name: "BMS College of Engineering Campus",
        event_format: "in_person",
        start_date: "2026-11-15",
        end_date: "2026-11-17",
        expected_footfall: 800,
        primary_audience: "Undergraduate Computer Science students, budding founders, developers",
        audience_age_range: "18-24",
        academic_disciplines: "Computer Science, AI/ML, Data Engineering, Design",
        institution_name: "BMS College of Engineering",
        budget_target_inr: 500000,
        support_types_needed: ["cash", "cloud_credits", "prizes", "food"],
        sponsorship_tiers: "Title (₹2.5L), Platinum (₹1L), Gold (₹50k), Cloud/API Partner",
        sponsor_benefits: "Keynote presentation, Dedicated recruitment resume database, Custom prize track, Booth at venue, Logo on all posters and badges",
        previous_sponsors_hint: "Google Cloud, GitHub, Postman, Red Bull",
        additional_notes: "Targeting dev-tool startups and tech companies looking for college tech talent.",
      });
    } else if (type === "fest") {
      setFormData({
        event_name: "Rendezvous Cultural Fest 2026",
        event_type: "cultural_fest",
        event_theme: "Echoes of Modern India",
        event_description: "Annual cultural festival hosting dance, music competitions, and celebrity night.",
        venue_city: "New Delhi",
        venue_state: "Delhi",
        venue_name: "IIT Delhi OAT",
        event_format: "in_person",
        start_date: "2026-10-25",
        end_date: "2026-10-28",
        expected_footfall: 15000,
        primary_audience: "College youth, creative artists, young adults across NCR colleges",
        audience_age_range: "17-25",
        academic_disciplines: "Engineering, Arts, Commerce, Media",
        institution_name: "IIT Delhi",
        budget_target_inr: 2500000,
        support_types_needed: ["cash", "food", "merchandise", "prizes"],
        sponsorship_tiers: "Title (₹10L), Powered By (₹5L), Associate (₹2L)",
        sponsor_benefits: "Main stage naming rights, Experience zones, Sampling stalls, Large hoardings, Social media shoutouts to 50k followers",
        previous_sponsors_hint: "Coca Cola, Fastrack, Spotify, Dominos",
        additional_notes: "Looking for beverage, FMCG, apparel, and lifestyle brands.",
      });
    } else {
      setFormData({
        event_name: "FinTech Innovation Summit",
        event_type: "tech_conference",
        event_theme: "Next-Gen Payments and Open Banking",
        event_description: "Premier student and professional conference discussing UPI innovations and algorithmic trading.",
        venue_city: "Mumbai",
        venue_state: "Maharashtra",
        venue_name: "Convention Hall, Bandra Kurla Complex",
        event_format: "hybrid",
        start_date: "2026-12-05",
        end_date: "2026-12-06",
        expected_footfall: 1200,
        primary_audience: "Finance professionals, MBA candidates, FinTech developers",
        audience_age_range: "21-35",
        academic_disciplines: "Finance, Economics, CS, Business Administration",
        institution_name: "FinTech Club & Industry Partners",
        budget_target_inr: 1200000,
        support_types_needed: ["cash", "cloud_credits"],
        sponsorship_tiers: "Principal Sponsor (₹5L), Co-sponsor (₹2L)",
        sponsor_benefits: "Panel speaking slots, VIP networking dinner access, Digital banners on live stream",
        previous_sponsors_hint: "Razorpay, Zerodha, HDFC Bank",
        additional_notes: "Fintech, banking, and wealth management companies.",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.event_name.trim()) {
      alert("Please enter the Event Name.");
      return;
    }
    if (!formData.venue_city.trim()) {
      alert("Please specify the Event City.");
      return;
    }
    await onSubmit(formData);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="discovery-form discovery-panel max-w-5xl mx-auto"
    >
      {/* Header with Quick Presets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--line)]">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)] m-0 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--accent)]" />
            Launch Live Sponsor Discovery
          </h2>
          <p className="text-xs text-[var(--muted)] m-0 mt-1">
            Provide details about your event. LangChain will construct targeted queries and verify real brand leads.
          </p>
        </div>

        {/* Quick Fill Preset Buttons */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <span className="text-[11px] text-[var(--muted)] font-medium">Quick Preset:</span>
          <button
            type="button"
            onClick={() => loadExamplePreset("hackathon")}
            className="text-xs px-2 py-1 rounded bg-[var(--surface-muted)] hover:bg-[var(--line)] text-[var(--text)] font-medium border border-[var(--line)]"
          >
            Hackathon
          </button>
          <button
            type="button"
            onClick={() => loadExamplePreset("fest")}
            className="text-xs px-2 py-1 rounded bg-[var(--surface-muted)] hover:bg-[var(--line)] text-[var(--text)] font-medium border border-[var(--line)]"
          >
            College Fest
          </button>
          <button
            type="button"
            onClick={() => loadExamplePreset("summit")}
            className="text-xs px-2 py-1 rounded bg-[var(--surface-muted)] hover:bg-[var(--line)] text-[var(--text)] font-medium border border-[var(--line)]"
          >
            Summit
          </button>
        </div>
      </div>

      {/* Step Navigation Tabs */}
      <div className="discovery-tabs">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={activeTab === "overview" ? "active flex items-center gap-1.5" : "flex items-center gap-1.5"}
        >
          <Layers className="w-4 h-4" />
          1. Event & Logistics
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audience")}
          className={activeTab === "audience" ? "active flex items-center gap-1.5" : "flex items-center gap-1.5"}
        >
          <Users className="w-4 h-4" />
          2. Target Audience & Persona
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sponsorship")}
          className={activeTab === "sponsorship" ? "active flex items-center gap-1.5" : "flex items-center gap-1.5"}
        >
          <DollarSign className="w-4 h-4" />
          3. Sponsorship Target & Value Prop
        </button>
      </div>

      {/* Tab 1: Event & Logistics */}
      {activeTab === "overview" && (
        <div className="field-grid">
          <div className="field-group sm:col-span-2">
            <label>
              Event Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. HackSprint 2026, Annual TechCon, Oasis Fest"
              value={formData.event_name}
              onChange={(e) => setFormData({ ...formData, event_name: e.target.value })}
              className="field"
            />
          </div>

          <div className="field-group">
            <label>
              Event Type *
            </label>
            <select
              value={formData.event_type}
              onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
              className="field"
            >
              <option value="hackathon">Hackathon / Coding Sprint</option>
              <option value="tech_conference">Tech Conference / Summit</option>
              <option value="cultural_fest">College Cultural Festival</option>
              <option value="sports">Sports Tournament</option>
              <option value="career_fair">Career Fair / Expo</option>
              <option value="workshop">Technical Workshop / Bootcamp</option>
              <option value="gaming">Esports / Gaming Tournament</option>
              <option value="entrepreneurship">E-Summit / Startup Pitch</option>
            </select>
          </div>

          <div className="field-group">
            <label>
              Host Institution / Organization
            </label>
            <input
              type="text"
              placeholder="e.g. IIT Delhi, BITS Pilani, Rotary Club"
              value={formData.institution_name || ""}
              onChange={(e) => setFormData({ ...formData, institution_name: e.target.value })}
              className="field"
            />
          </div>

          <div className="field-group">
            <label>
              Event Theme or Tagline
            </label>
            <input
              type="text"
              placeholder="e.g. AI for Sustainability, Innovate Beyond Boundaries"
              value={formData.event_theme || ""}
              onChange={(e) => setFormData({ ...formData, event_theme: e.target.value })}
              className="field"
            />
          </div>

          <div className="field-group">
            <label>
              Format
            </label>
            <select
              value={formData.event_format || "in_person"}
              onChange={(e) => setFormData({ ...formData, event_format: e.target.value as any })}
              className="field"
            >
              <option value="in_person">In-Person at Venue</option>
              <option value="hybrid">Hybrid (Physical + Virtual Stream)</option>
              <option value="online">Fully Online / Remote</option>
            </select>
          </div>

          <div className="field-group">
            <label>
              City (Location) *
            </label>
            <div className="field-with-icon">
              <MapPin className="w-4 h-4" />
              <input
                type="text"
                required
                placeholder="e.g. Bengaluru, New Delhi, Mumbai, Pune, Hyderabad"
                value={formData.venue_city}
                onChange={(e) => setFormData({ ...formData, venue_city: e.target.value })}
                className="field field-icon"
              />
            </div>
          </div>

          <div className="field-group">
            <label>
              State / Region
            </label>
            <input
              type="text"
              placeholder="e.g. Karnataka, Maharashtra, Delhi NCR"
              value={formData.venue_state || ""}
              onChange={(e) => setFormData({ ...formData, venue_state: e.target.value })}
              className="field"
            />
          </div>

          <div className="field-group">
            <label>
              Start Date
            </label>
            <input
              type="date"
              value={formData.start_date || ""}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              className="field"
            />
          </div>

          <div className="field-group">
            <label>
              End Date
            </label>
            <input
              type="date"
              value={formData.end_date || ""}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              className="field"
            />
          </div>

          <div className="field-group sm:col-span-2">
            <label>
              Event Description & Context
            </label>
            <textarea
              rows={2}
              placeholder="Short summary of what happens at the event, its scale and reputation."
              value={formData.event_description || ""}
              onChange={(e) => setFormData({ ...formData, event_description: e.target.value })}
              className="field field-textarea"
            />
          </div>
        </div>
      )}

      {/* Tab 2: Target Audience & Persona */}
      {activeTab === "audience" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="field-group">
            <label>
              Expected Footfall / Attendees
            </label>
            <div className="field-with-icon">
              <Users className="w-4 h-4" />
              <input
                type="number"
                min="10"
                max="1000000"
                placeholder="e.g. 500, 2000, 15000"
                value={formData.expected_footfall || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    expected_footfall: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                className="field field-icon"
              />
            </div>
            <span className="field-hint">
              Helps determine appropriate sponsor size and reach.
            </span>
          </div>

          <div className="field-group">
            <label>
              Target Age Group
            </label>
            <input
              type="text"
              placeholder="e.g. 18-24, 21-35, High School & College"
              value={formData.audience_age_range || ""}
              onChange={(e) => setFormData({ ...formData, audience_age_range: e.target.value })}
              className="field"
            />
          </div>

          <div className="field-group sm:col-span-2">
            <label>
              Primary Audience Persona
            </label>
            <input
              type="text"
              placeholder="e.g. Undergrad CS students, software engineers, young founders, music lovers"
              value={formData.primary_audience || ""}
              onChange={(e) => setFormData({ ...formData, primary_audience: e.target.value })}
              className="field"
            />
          </div>

          <div className="field-group sm:col-span-2">
            <label>
              Academic Disciplines & Interests
            </label>
            <input
              type="text"
              placeholder="e.g. Computer Science, AI/ML, Robotics, Design, Commerce, BioTech"
              value={formData.academic_disciplines || ""}
              onChange={(e) => setFormData({ ...formData, academic_disciplines: e.target.value })}
              className="field"
            />
            <span className="field-hint">
              Used to match niche technology and industry sponsors.
            </span>
          </div>
        </div>
      )}

      {/* Tab 3: Sponsorship Target & Value Prop */}
      {activeTab === "sponsorship" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="field-group">
            <label>
              Target Sponsorship Budget (INR ₹)
            </label>
            <div className="field-with-icon field-with-prefix">
              <span>₹</span>
              <input
                type="number"
                min="0"
                step="5000"
                placeholder="e.g. 500000 (5 Lakhs)"
                value={formData.budget_target_inr || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    budget_target_inr: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
                className="field field-icon"
              />
            </div>
          </div>

          <div className="field-group">
            <label>
              Previous Sponsors / Hints
            </label>
            <input
              type="text"
              placeholder="e.g. Google Cloud, Red Bull, Postman, Dell"
              value={formData.previous_sponsors_hint || ""}
              onChange={(e) => setFormData({ ...formData, previous_sponsors_hint: e.target.value })}
              className="field"
            />
            <span className="field-hint">
              Helps find competitors or similar brands that sponsor events.
            </span>
          </div>

          <div className="field-group sm:col-span-2">
            <label>
              Support Types Needed (Select all that apply)
            </label>
            <div className="chip-group">
              {supportTypeOptions.map((opt) => {
                const isSelected = (formData.support_types_needed || []).includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleToggleSupportType(opt.value)}
                    className={`chip ${isSelected ? "chip-selected" : ""}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field-group sm:col-span-2">
            <label>
              Key Deliverables & Benefits Offered to Sponsors
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Keynote speech, Booth space, Resume database, Logo on badges, Social media shoutouts"
              value={formData.sponsor_benefits || ""}
              onChange={(e) => setFormData({ ...formData, sponsor_benefits: e.target.value })}
              className="field field-textarea"
            />
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-[var(--line)]">
        <div className="flex items-center gap-2">
          {activeTab !== "overview" && (
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === "sponsorship" ? "audience" : "overview")}
              className="button button-secondary text-xs px-3 py-1.5"
            >
              Back
            </button>
          )}

          {activeTab !== "sponsorship" && (
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === "overview" ? "audience" : "sponsorship")}
              className="button button-secondary text-xs px-3 py-1.5"
            >
              Next Step →
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="button button-secondary text-xs"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !formData.event_name.trim() || !formData.venue_city.trim()}
            className="button text-xs font-bold px-5 py-2.5 flex items-center gap-2 shadow-sm"
          >
            {isSubmitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Launching Research Pipeline…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Start Sponsor Discovery
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
