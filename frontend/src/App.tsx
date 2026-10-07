import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getMember } from "@/lib/api";
import { DoctorProfile } from "@/components/DoctorProfile";
import { ClinicProfile } from "@/components/ClinicProfile";
import type { MemberProfile } from "@/types";

export default function MemberProfilePage() {
  const { memberId } = useParams();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId) {
      setError("Member ID is required");
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchMember = async () => {
      try {
        const response = await getMember(memberId);
        if (response.data?.errors) {
          throw new Error(response.data.errors[0]?.message || "Unable to load member profile");
        }

        if (isMounted) {
          setProfile(response.data?.data?.getMember ?? null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Unable to load member profile");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchMember();

    return () => {
      isMounted = false;
    };
  }, [memberId]);

  if (loading) {
    return <div className="p-6 text-sm text-ink-600">Loading profile...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-rose-600">{error}</div>;
  }

  if (!profile) {
    return <div className="p-6 text-sm text-ink-600">Profile not found.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {profile.memberType === "DOCTOR" && <DoctorProfile doctor={profile} />}
      {profile.memberType === "CLINIC" && <ClinicProfile clinic={profile} />}
      {profile.memberType === "USER" && (
        <div className="rounded-xl border border-ink-900/8 bg-white p-6 shadow-card">
          <h2 className="font-display text-xl font-medium text-ink-900">
            {profile.memberFullName || profile.memberNick || "User profile"}
          </h2>
          {profile.memberDesc && <p className="mt-3 text-sm text-ink-700">{profile.memberDesc}</p>}
        </div>
      )}
    </div>
  );
}
