"use client";
import { useParams } from "next/navigation";
import { DoctorBookingContainer } from "@/components/booking/DoctorBookingContainer";

export default function DoctorPage() {
  const { id } = useParams<{ id: string }>();
  return <DoctorBookingContainer doctorId={id} />;
}
