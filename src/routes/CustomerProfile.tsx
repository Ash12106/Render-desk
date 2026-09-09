import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/src/api';

export function CustomerProfile() {
  const profile = useQuery({ queryKey: ['customer-profile'], queryFn: api.getCustomerProfile });
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (profile.data)
      setForm({ name: profile.data.name, email: profile.data.email || '', phone: profile.data.phone || '' });
  }, [profile.data]);
  if (profile.isPending) return <div className="animate-pulse h-64 bg-surface border border-line rounded-md m-8" />;
  if (profile.error || !profile.data) return <p className="p-8 text-danger">Unable to load profile.</p>;
  const customer = profile.data;
  const update = async (event: React.FormEvent) => {
    event.preventDefault();
    await api.updateCustomerProfile(form);
    await profile.refetch();
    setEditing(false);
  };
  const field = (label: string, value: string | undefined) => (
    <div>
      <p className="font-mono text-[10px] font-bold uppercase text-ink-muted mb-1">{label}</p>
      <p className="text-sm font-medium text-ink">{value || 'Not provided'}</p>
    </div>
  );
  return (
    <div className="max-w-4xl mx-auto px-4 space-y-8 pb-16">
      <div className="flex items-end justify-between border-b-2 border-ink pb-6">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ink-muted mb-2">Customer profile</p>
          <h1 className="text-4xl font-sans font-black text-ink">{customer.name}</h1>
        </div>
        <Link to="/customer" className="font-mono text-xs font-bold uppercase underline">
          Back to portal
        </Link>
      </div>
      <section className="bg-surface border-2 border-ink rounded-md p-6">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wider mb-5">Basic and contact information</h2>
        {editing ? (
          <form onSubmit={update} className="grid sm:grid-cols-2 gap-3">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border-2 border-ink rounded-md p-3"
              placeholder="Full name"
            />
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="border-2 border-ink rounded-md p-3"
              placeholder="Email"
            />
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="border-2 border-ink rounded-md p-3"
              placeholder="Phone"
            />
            <button className="bg-ink text-white rounded-md p-3 font-mono text-xs font-bold uppercase">
              Save details
            </button>
          </form>
        ) : (
          <div className="grid sm:grid-cols-2 gap-6">
            {field('Full name', customer.name)}
            {field('Email address', customer.email || undefined)}
            {field('Customer since', new Date(customer.createdAt).toLocaleString())}
            {field('Last updated', new Date(customer.updatedAt).toLocaleString())}
            {field('Customer ID', customer.customerCode || customer.id)}
          </div>
        )}
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          className="mt-6 font-mono text-xs font-bold uppercase underline"
        >
          {editing ? 'Cancel' : 'Edit contact details'}
        </button>
      </section>
      <p className="text-sm text-ink-muted">
        Keep your contact details current so our support team can reach you about your requests.
      </p>
    </div>
  );
}
