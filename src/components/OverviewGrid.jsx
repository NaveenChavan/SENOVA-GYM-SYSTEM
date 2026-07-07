import React from "react";
import useGymStore from "../store/gymStore";

const OverviewGrid = () => {
  // Consume from centralized store
  const membersList = useGymStore((state) => state.members);

  const activeMembers = membersList.filter((m) => m.status === "Active").length;
  const frozenMembers = membersList.filter((m) => m.status === "Frozen").length;
  const totalRevenue = membersList.reduce(
    (acc, m) => acc + Number(m.amountPaid || 0),
    0,
  );
  const totalPendingDues = membersList.reduce(
    (acc, m) => acc + Number(m.amountPending || 0),
    0,
  );
  const totalExpected = totalRevenue + totalPendingDues;
  const collectionPercentage =
    totalExpected > 0 ? Math.round((totalRevenue / totalExpected) * 100) : 0;

  const planDistribution = membersList.reduce((acc, m) => {
    if (m.plan) acc[m.plan] = (acc[m.plan] || 0) + 1;
    return acc;
  }, {});

  const plansKeys = Object.keys(planDistribution);
  const maxPlanCount = Math.max(...Object.values(planDistribution), 1);

  const upcomingExpiries = membersList.filter((m) => {
    if (m.status !== "Active") return false;
    const diffDays = Math.ceil(
      (new Date(m.expiryDate) - new Date()) / (1000 * 60 * 60 * 24),
    );
    return diffDays >= 0 && diffDays <= 7;
  });

  return (
    <div className="p-8 space-y-6 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      <div className="flex justify-between items-center bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl font-bold">
            📊
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              X-Intelligence Executive Overview
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Live enterprise metrics compiled directly from local engine
              blocks.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 bg-blue-500 w-full"></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Active Rosters
          </p>
          <h3 className="text-2xl font-black text-slate-900 mt-1.5 font-mono">
            {activeMembers}
          </h3>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 bg-amber-500 w-full"></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Frozen Accounts
          </p>
          <h3 className="text-2xl font-black text-amber-500 mt-1.5 font-mono">
            {frozenMembers}
          </h3>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 bg-emerald-500 w-full"></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Gross Revenue
          </p>
          <h3 className="text-2xl font-black text-emerald-600 mt-1.5 font-mono">
            ₹{totalRevenue}
          </h3>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 bg-rose-500 w-full"></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Outstanding Dues
          </p>
          <h3 className="text-2xl font-black text-rose-500 mt-1.5 font-mono">
            ₹{totalPendingDues}
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest">
            Subscription Plan Distribution
          </h4>
          <div className="space-y-4">
            {plansKeys.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                No plan allocation detected.
              </p>
            ) : (
              plansKeys.map((plan) => {
                const count = planDistribution[plan];
                return (
                  <div key={plan} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-500">{plan}</span>
                      <span className="text-slate-800 font-mono">
                        {count} Profiles
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full"
                        style={{ width: `${(count / maxPlanCount) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-3">
            Financial Liquidity Matrix
          </h4>
          <div className="flex items-center justify-around gap-4">
            <div className="space-y-2 w-1/2">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">Paid</span>
                <span className="text-xs font-bold font-mono text-emerald-600">
                  ₹{totalRevenue}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">
                  Pending
                </span>
                <span className="text-xs font-bold font-mono text-rose-500">
                  ₹{totalPendingDues}
                </span>
              </div>
            </div>
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg
                className="w-full h-full transform -rotate-90"
                viewBox="0 0 36 36"
              >
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="none"
                  stroke="#F1F5F9"
                  strokeWidth="3"
                ></circle>
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="3"
                  strokeDasharray={`${collectionPercentage} ${100 - collectionPercentage}`}
                ></circle>
              </svg>
              <div className="absolute text-center">
                <p className="text-sm font-black text-slate-900 font-mono">
                  {collectionPercentage}%
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-3 lg:col-span-2">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">
            ⚠️ Critical Expiry Desk
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-40 overflow-y-auto">
            {upcomingExpiries.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 col-span-2 text-center">
                No rosters critical for renewal this week.
              </p>
            ) : (
              upcomingExpiries.map((m) => (
                <div
                  key={m.id}
                  className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex justify-between items-center"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-800">{m.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {m.phone} • {m.plan}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-rose-500 font-bold font-mono block">
                      Expires Soon
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono">
                      {m.expiryDate}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewGrid;
