<template>
  <q-page class="p-2 h-[calc(100vh-50px)] overflow-hidden flex flex-col">
    <q-card flat bordered class="bg-white mb-2 shrink-0 -mt-2">
      <q-card-section class="row items-center justify-between q-pa-sm">
        <div class="c-row c-gutter-4 items-end mb-4">
          <div class="c-col-md-8 c-col-12">
            <div class="text-h5 font-bold">Dashboard</div>
            <div class="text-subtitle2 text-grey-7">
              Branch-wise overview of sales, purchase, stock and financial metrics.
            </div>
          </div>
          <div class="c-col-md-4 c-col-12">
            <div class="text-subtitle2">Branch filter</div>
            <SwitchBranchInput v-model="branchId" returnType="id" :allBranch="true" />
          </div>
        </div>
      </q-card-section>
    </q-card>

    <div class="flex-1 overflow-y-auto -mr-2 pr-2">
      <div class="c-row c-gutter-4">
      <div class="c-col-md-6 c-col-12" id="chart">
        <q-card flat bordered class="!bg-white overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Sales Trend</div>
              <div class="text-base font-semibold text-gray-800">Monthly · This Year</div>
            </div>
            <div class="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">12 mo</div>
          </div>
          <template v-if="dashboardLoaded">
            <div class="px-4 pt-3 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-md bg-blue-50/60 py-1">
                <div class="text-[10px] uppercase tracking-wider text-blue-700/70 font-semibold">Total</div>
                <div class="text-sm font-bold text-blue-800">{{ compactNumber(yearStats.total) }}</div>
              </div>
              <div class="rounded-md bg-blue-50/60 py-1">
                <div class="text-[10px] uppercase tracking-wider text-blue-700/70 font-semibold">Peak</div>
                <div class="text-sm font-bold text-blue-800">{{ compactNumber(yearStats.peak) }}</div>
              </div>
              <div class="rounded-md bg-blue-50/60 py-1">
                <div class="text-[10px] uppercase tracking-wider text-blue-700/70 font-semibold">Avg</div>
                <div class="text-sm font-bold text-blue-800">{{ compactNumber(yearStats.avg) }}</div>
              </div>
            </div>
            <apexchart type="area" height="260" :options="chartOptions" :series="series"></apexchart>
          </template>
          <div v-else class="p-4">
            <div class="grid grid-cols-3 gap-2 mb-3">
              <q-skeleton height="36px" />
              <q-skeleton height="36px" />
              <q-skeleton height="36px" />
            </div>
            <q-skeleton height="220px" />
          </div>
        </q-card>
      </div>
      <div class="c-col-md-6 c-col-12" id="chart2">
        <q-card flat bordered class="!bg-white overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Recent Activity</div>
              <div class="text-base font-semibold text-gray-800">Past 7 Days Sales</div>
            </div>
            <div class="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">7 d</div>
          </div>
          <template v-if="dashboardLoaded">
            <div class="px-4 pt-3 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-md bg-emerald-50/60 py-1">
                <div class="text-[10px] uppercase tracking-wider text-emerald-700/70 font-semibold">Total</div>
                <div class="text-sm font-bold text-emerald-800">{{ compactNumber(weekStats.total) }}</div>
              </div>
              <div class="rounded-md bg-emerald-50/60 py-1">
                <div class="text-[10px] uppercase tracking-wider text-emerald-700/70 font-semibold">Peak</div>
                <div class="text-sm font-bold text-emerald-800">{{ compactNumber(weekStats.peak) }}</div>
              </div>
              <div class="rounded-md bg-emerald-50/60 py-1">
                <div class="text-[10px] uppercase tracking-wider text-emerald-700/70 font-semibold">Avg</div>
                <div class="text-sm font-bold text-emerald-800">{{ compactNumber(weekStats.avg) }}</div>
              </div>
            </div>
            <apexchart type="area" height="260" :options="chartOptions2" :series="series2"></apexchart>
          </template>
          <div v-else class="p-4">
            <div class="grid grid-cols-3 gap-2 mb-3">
              <q-skeleton height="36px" />
              <q-skeleton height="36px" />
              <q-skeleton height="36px" />
            </div>
            <q-skeleton height="220px" />
          </div>
        </q-card>
      </div>
      <div class="c-col-12">
        <div class="flex items-center justify-between pb-2">
          <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Payment Methods</div>
          <div v-if="dashboardLoaded" class="text-sm text-gray-600">
            Total:
            <span class="font-bold" :class="accountsTotal >= 0 ? 'text-green-700' : 'text-red-600'">
              {{ floatToFixed(accountsTotal).toLocaleString() }}
            </span>
          </div>
          <q-skeleton v-else width="120px" height="20px" />
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <template v-if="dashboardLoaded">
            <div v-for="account in dashboardDataStore.dataList?.value?.accounts || []" :key="account.id"
              class="rounded-lg border bg-white p-3 hover:shadow-sm transition-shadow"
              :class="account.balance >= 0 ? 'border-gray-200' : 'border-red-200'">
              <div class="flex items-center justify-between">
                <div class="text-sm font-medium text-gray-700 truncate">{{ account.name }}</div>
                <div class="text-[10px] px-1.5 rounded uppercase tracking-wider font-semibold"
                  :class="account.balance > 0 ? 'bg-green-100 text-green-700' : account.balance < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'">
                  {{ account.balance > 0 ? 'Credit' : account.balance < 0 ? 'Debit' : 'Zero' }} </div>
                </div>
                <div class="text-xl font-bold pt-1" :class="account.balance >= 0 ? 'text-gray-800' : 'text-red-600'">
                  {{ floatToFixed(account.balance).toLocaleString() }}
                </div>
              </div>
          </template>
          <template v-else>
            <div v-for="n in 5" :key="n" class="rounded-lg border border-gray-200 bg-white p-3">
              <div class="flex items-center justify-between">
                <q-skeleton width="60px" height="16px" />
                <q-skeleton width="40px" height="14px" />
              </div>
              <q-skeleton class="mt-2" height="22px" />
            </div>
          </template>
        </div>
      </div>
    </div>
    <div class="q-mb-md q-mt-md">
      <div class="flex items-center justify-between pb-2">
        <div>
          <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">{{ summaryLabel }} Cash Flow</div>
          <div class="text-[10px] text-gray-400">Money in vs out, grouped by activity for the selected date range.</div>
        </div>
        <DateFilterInput v-model="summaryDateFilter" valueType="string" />
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pb-3">
        <template v-if="summaryLoaded">
          <div class="rounded-xl p-4 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-sm">
            <div class="text-xs uppercase tracking-wider opacity-90">Cash In</div>
            <div class="text-3xl font-bold pt-1">{{ totals.cashIn.toLocaleString() }}</div>
            <div class="text-xs opacity-80 pt-1">{{ counts.cashIn }} entries</div>
          </div>
          <div class="rounded-xl p-4 bg-gradient-to-br from-red-500 to-red-600 text-white shadow-sm">
            <div class="text-xs uppercase tracking-wider opacity-90">Cash Out</div>
            <div class="text-3xl font-bold pt-1">{{ totals.cashOut.toLocaleString() }}</div>
            <div class="text-xs opacity-80 pt-1">{{ counts.cashOut }} entries</div>
          </div>
          <div class="rounded-xl p-4 text-white shadow-sm"
            :class="totals.net >= 0 ? 'bg-gradient-to-br from-blue-500 to-blue-700' : 'bg-gradient-to-br from-orange-500 to-orange-600'">
            <div class="text-xs uppercase tracking-wider opacity-90">Net Balance</div>
            <div class="text-3xl font-bold pt-1">{{ totals.net.toLocaleString() }}</div>
            <div class="text-xs opacity-80 pt-1">{{ totals.net >= 0 ? 'Surplus' : 'Deficit' }}</div>
          </div>
        </template>
        <template v-else>
          <div v-for="n in 3" :key="n" class="rounded-xl p-4 bg-gray-100">
            <q-skeleton width="80px" height="12px" />
            <q-skeleton class="mt-2" height="32px" />
            <q-skeleton class="mt-2" width="100px" height="10px" />
          </div>
        </template>
      </div>

      <div class="flex items-center justify-between pb-2">
        <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">By Activity ({{ summaryLabel }})</div>
        <q-btn dense flat size="sm" :label="showAllActivities ? 'Hide zeros' : 'Show all'"
          @click="showAllActivities = !showAllActivities" color="primary" />
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 q-mb-md">
        <template v-if="!summaryLoaded">
          <div v-for="n in 6" :key="n" class="rounded-lg border border-gray-200 bg-white p-2">
            <div class="flex justify-between"><q-skeleton width="80px" height="14px" /><q-skeleton width="30px"
                height="14px" /></div>
            <q-skeleton class="mt-1" height="12px" />
            <q-skeleton class="mt-1" height="4px" />
          </div>
        </template>
        <div v-for="row in (summaryLoaded ? visibleActivities : [])" :key="row.activity"
          class="rounded-lg border bg-white p-2 hover:shadow-sm transition-shadow"
          :class="(row.cashIn || row.cashOut) ? 'border-gray-200' : 'border-dashed border-gray-200'">
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium text-gray-700 truncate">{{ row.activity }}</div>
            <div class="text-xs px-1.5 rounded"
              :class="row.cashIn > row.cashOut ? 'bg-green-100 text-green-700' : row.cashOut > row.cashIn ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'">
              {{ row.cashIn > row.cashOut ? 'IN' : row.cashOut > row.cashIn ? 'OUT' : '—' }}
            </div>
          </div>
          <div class="flex justify-between items-baseline pt-1 text-xs">
            <span :class="row.cashIn ? 'text-green-700 font-semibold' : 'text-gray-300'">+{{ row.cashIn || 0 }}</span>
            <span :class="row.cashOut ? 'text-red-600 font-semibold' : 'text-gray-300'">-{{ row.cashOut || 0 }}</span>
          </div>
          <div class="h-1 rounded-full bg-gray-100 overflow-hidden mt-1 flex" v-if="row.cashIn || row.cashOut">
            <div class="bg-green-500 h-full" :style="{ width: activityPct(row, 'in') + '%' }"></div>
            <div class="bg-red-500 h-full" :style="{ width: activityPct(row, 'out') + '%' }"></div>
          </div>
        </div>
        <div v-if="summaryLoaded && !visibleActivities.length"
          class="col-span-full text-center text-gray-400 text-sm py-4">
          No activity in selected range
        </div>
      </div>
    </div>
    <div class="c-row c-gutter-4">
      <div class="c-col-12">
        <div class="pt-4 pb-2">
          <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Sales / Purchase ({{ summaryLabel
            }})
          </div>
          <div class="text-[10px] text-gray-400">Revenue, payable and gross profit for the selected date range.</div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <template v-if="summaryLoaded">
            <div class="rounded-xl p-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm">
              <div class="text-xs uppercase tracking-wider opacity-90">Sales</div>
              <div class="text-2xl font-bold pt-1">{{ floatToFixed(salesTotals.amount).toLocaleString() }}</div>
              <div class="text-xs opacity-80 pt-1">{{ salesTotals.count }} invoices</div>
            </div>
            <div class="rounded-xl p-4 bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm">
              <div class="text-xs uppercase tracking-wider opacity-90">Sales Due</div>
              <div class="text-2xl font-bold pt-1">{{ floatToFixed(salesTotals.due).toLocaleString() }}</div>
              <div class="text-xs opacity-80 pt-1">Outstanding</div>
            </div>
            <div class="rounded-xl p-4 bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-sm">
              <div class="text-xs uppercase tracking-wider opacity-90">Purchase</div>
              <div class="text-2xl font-bold pt-1">{{ floatToFixed(purchaseTotals.amount).toLocaleString() }}</div>
              <div class="text-xs opacity-80 pt-1">{{ purchaseTotals.count }} orders</div>
            </div>
            <div class="rounded-xl p-4 bg-gradient-to-br from-fuchsia-500 to-fuchsia-600 text-white shadow-sm">
              <div class="text-xs uppercase tracking-wider opacity-90">Purchase Due</div>
              <div class="text-2xl font-bold pt-1">{{ floatToFixed(purchaseTotals.due).toLocaleString() }}</div>
              <div class="text-xs opacity-80 pt-1">Payable</div>
            </div>
            <div class="rounded-xl p-4 text-white shadow-sm col-span-2 md:col-span-4"
              :class="grossProfit >= 0 ? 'bg-gradient-to-br from-indigo-500 to-indigo-700' : 'bg-gradient-to-br from-orange-500 to-orange-600'">
              <div class="flex justify-between items-center">
                <div>
                  <div class="text-xs uppercase tracking-wider opacity-90">Gross Profit (Sales − Purchase)</div>
                  <div class="text-3xl font-bold pt-1">{{ floatToFixed(grossProfit).toLocaleString() }}</div>
                </div>
                <div class="text-sm opacity-90">{{ grossProfit >= 0 ? 'Profit' : 'Loss' }}</div>
              </div>
            </div>
          </template>
          <template v-else>
            <div v-for="n in 4" :key="n" class="rounded-xl p-4 bg-gray-100">
              <q-skeleton width="80px" height="12px" />
              <q-skeleton class="mt-2" height="28px" />
              <q-skeleton class="mt-2" width="80px" height="10px" />
            </div>
            <div class="rounded-xl p-4 bg-gray-100 col-span-2 md:col-span-4">
              <q-skeleton width="180px" height="12px" />
              <q-skeleton class="mt-2" height="36px" />
            </div>
          </template>
        </div>
      </div>
      <div class="c-col-12">
        <div class="pt-4 pb-2">
          <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Financial Position</div>
          <div class="text-[10px] text-gray-400">Snapshot of what the business owns vs owes.</div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <template v-if="dashboardLoaded">
            <div class="rounded-xl p-4 bg-gradient-to-br from-teal-600 to-teal-700 text-white shadow-sm">
              <div class="text-xs uppercase tracking-wider opacity-90">Total Assets</div>
              <div class="text-2xl font-bold pt-1">{{ floatToFixed(totalAssets).toLocaleString() }}</div>
              <div class="text-[10px] opacity-80 pt-1">Cash + Stock + Receivable + Prepaid</div>
            </div>
            <div class="rounded-xl p-4 bg-gradient-to-br from-red-600 to-red-800 text-white shadow-sm">
              <div class="text-xs uppercase tracking-wider opacity-90">Total Liabilities</div>
              <div class="text-2xl font-bold pt-1">{{ floatToFixed(totalLiabilities).toLocaleString() }}</div>
              <div class="text-[10px] opacity-80 pt-1">Supplier + Unpaid Exp/Salary</div>
            </div>
            <div class="rounded-xl p-4 text-white shadow-sm"
              :class="netBusinessValue >= 0 ? 'bg-gradient-to-br from-indigo-600 to-indigo-800' : 'bg-gradient-to-br from-orange-500 to-orange-600'">
              <div class="text-xs uppercase tracking-wider opacity-90">Net Business Value</div>
              <div class="text-2xl font-bold pt-1">{{ floatToFixed(netBusinessValue).toLocaleString() }}</div>
              <div class="text-[10px] opacity-80 pt-1">{{ netBusinessValue >= 0 ? 'Positive' : 'Negative' }}</div>
            </div>
          </template>
          <template v-else>
            <div v-for="n in 3" :key="n" class="rounded-xl p-4 bg-gray-100">
              <q-skeleton width="80px" height="12px" />
              <q-skeleton class="mt-2" height="28px" />
            </div>
          </template>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
          <template v-if="dashboardLoaded">
            <div v-for="f in financialDetailCards" :key="f.label"
              class="rounded-lg border border-gray-200 bg-white p-3 hover:shadow-sm transition-shadow">
              <div class="text-xs text-gray-500 uppercase tracking-wider">{{ f.label }}</div>
              <div class="text-xl font-bold pt-1" :class="f.color">{{ floatToFixed(f.value || 0).toLocaleString() }}
              </div>
              <div class="text-[10px] text-gray-500 pt-1">{{ f.note }}</div>
            </div>
          </template>
          <template v-else>
            <div v-for="n in 5" :key="n" class="rounded-lg border border-gray-200 bg-white p-3">
              <q-skeleton width="60px" height="10px" />
              <q-skeleton class="mt-2" height="22px" />
            </div>
          </template>
        </div>
      </div>
      <div class="c-col-12">
        <div class="pt-4 pb-2">
          <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Sales by Period</div>
          <div class="text-[10px] text-gray-400">Sold amount and outstanding dues for today, week, month and year.</div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <template v-if="dashboardLoaded">
            <div v-for="p in salesPeriodCards" :key="p.label"
              class="rounded-xl p-3 bg-white border border-gray-200 hover:shadow-sm transition-shadow">
              <div class="flex items-center justify-between">
                <div class="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{{ p.label }}</div>
                <div class="text-[10px] px-1.5 rounded bg-emerald-50 text-emerald-700 font-semibold">SALE</div>
              </div>
              <div class="text-2xl font-bold pt-1 text-emerald-700">{{ floatToFixed(p.amount).toLocaleString() }}</div>
              <div class="flex justify-between items-center pt-1 border-t border-gray-100 mt-1">
                <span class="text-[10px] text-gray-500">Due</span>
                <span class="text-sm font-semibold" :class="p.due > 0 ? 'text-red-600' : 'text-gray-400'">{{
                  floatToFixed(p.due).toLocaleString() }}</span>
              </div>
            </div>
          </template>
          <template v-else>
            <div v-for="n in 4" :key="n" class="rounded-xl p-3 bg-white border border-gray-200">
              <q-skeleton width="60px" height="10px" />
              <q-skeleton class="mt-2" height="28px" />
              <q-skeleton class="mt-2" height="14px" />
            </div>
          </template>
        </div>
      </div>
      <div class="c-col-12">
        <div class="pt-4 pb-2">
          <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Purchase by Period</div>
          <div class="text-[10px] text-gray-400">Purchase amount and unpaid dues for today, week, month and year.</div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <template v-if="dashboardLoaded">
            <div v-for="p in purchasePeriodCards" :key="p.label"
              class="rounded-xl p-3 bg-white border border-gray-200 hover:shadow-sm transition-shadow">
              <div class="flex items-center justify-between">
                <div class="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{{ p.label }}</div>
                <div class="text-[10px] px-1.5 rounded bg-rose-50 text-rose-700 font-semibold">BUY</div>
              </div>
              <div class="text-2xl font-bold pt-1 text-rose-700">{{ floatToFixed(p.amount).toLocaleString() }}</div>
              <div class="flex justify-between items-center pt-1 border-t border-gray-100 mt-1">
                <span class="text-[10px] text-gray-500">Due</span>
                <span class="text-sm font-semibold" :class="p.due > 0 ? 'text-red-600' : 'text-gray-400'">{{
                  floatToFixed(p.due).toLocaleString() }}</span>
              </div>
            </div>
          </template>
          <template v-else>
            <div v-for="n in 4" :key="n" class="rounded-xl p-3 bg-white border border-gray-200">
              <q-skeleton width="60px" height="10px" />
              <q-skeleton class="mt-2" height="28px" />
              <q-skeleton class="mt-2" height="14px" />
            </div>
          </template>
        </div>
      </div>
      <div class="c-col-12">
        <div class="pt-4 pb-2">
          <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Inventory & People</div>
          <div class="text-[10px] text-gray-400">Stock value, product counts and registered contacts/staff/users.</div>
        </div>
      </div>
      <div class="c-col-12">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <template v-if="dashboardLoaded">
            <div v-for="item in inventoryCards" :key="item.label"
              class="rounded-lg border border-gray-200 bg-white p-3 hover:shadow-sm transition-shadow">
              <div class="text-xs text-gray-500 uppercase tracking-wider">{{ item.label }}</div>
              <div class="text-2xl font-bold pt-1" :class="item.color">{{ floatToFixed(item.value || 0).toLocaleString()
                }}</div>
              <div v-if="item.note" class="text-[10px] text-gray-500 pt-1">{{ item.note }}</div>
            </div>
          </template>
          <template v-else>
            <div v-for="n in 8" :key="n" class="rounded-lg border border-gray-200 bg-white p-3">
              <q-skeleton width="80px" height="12px" />
              <q-skeleton class="mt-2" height="24px" />
            </div>
          </template>
        </div>
      </div>
      <!-- <div class="c-col-md-12 c-col-12">
        <div>
          <q-img src="/images/site-statistics.png" />
        </div>
      </div> -->
    </div>
    </div>
  </q-page>
</template>
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useDataStore } from "@/composables/useDataStore.js";
import { floatToFixed } from "../utils/numberHelper";
import DateFilterInput from "@/components/DateFilterInput.vue";
import SwitchBranchInput from "@/components/input/SwitchBranchInput.vue";
import { toStartOfDay, toEndOfDay } from "@/utils/dateUtils.js";
import { sentenceCase } from "change-case";
import { api } from "@/boot/axios";
import { getToken } from "@/utils/token";
import { useUserAuthStore } from "../stores/userAuthStore";
import useUpdateSearchParams from "@/composables/useUpdateSearchParams.js";

const route = useRoute();
const userAuthStore = useUserAuthStore();
const { mergeSearchParams } = useUpdateSearchParams();
const dashboardDataStore = useDataStore({
  url: "/api/dashboard",
});


const branchId = ref(
  route.query.branchId ||
  userAuthStore.userData?.selectedBranch ||
  userAuthStore.userData?.branchId ||
  ""
);

watch(
  () => userAuthStore.userData?.selectedBranch || userAuthStore.userData?.branch,
  (value) => {
    if (value && !branchId.value) branchId.value = value;
  },
  { immediate: true }
);
watch(branchId, (value) => {
  mergeSearchParams({ branchId: value || "" });
});

const reloadDashboardData = () => {
  dashboardDataStore.getDataList({
    params: { branchId: branchId.value || "__all__" },
  });
};
watch(branchId, reloadDashboardData);
onMounted(reloadDashboardData);

const ALL_ACTIVITIES = [
  "productSale", "addMoney", "contactPayment", "supplierOpeningDue", "purchaseReturn",
  "productSaleReturn", "supplierPayment", "employeeSalary", "withdrawMoney",
  "contactWithdraw", "contactOpeningDue", "supplierWithdraw", "purchase", "expense",
];

const summaryLoaded = ref(false);
const summaryData = ref({
  sales: { amount: 0, due: 0, count: 0 },
  purchase: { amount: 0, due: 0, count: 0 },
  cash: { cashIn: 0, cashOut: 0, cashInCount: 0, cashOutCount: 0, net: 0 },
  byActivity: {},
  erp: { activeBundles: 0, productionsThisMonth: 0, adjustmentsThisMonth: 0 },
});
const showAllActivities = ref(false);
const summaryDateFilter = ref(JSON.stringify({
  $gte: toStartOfDay(new Date()),
  $lte: toEndOfDay(new Date()),
}));

const summaryLabel = computed(() => {
  try {
    const f = typeof summaryDateFilter.value === "string" ? JSON.parse(summaryDateFilter.value || "{}") : (summaryDateFilter.value || {});
    if (!f.$gte && !f.$lte) return "All Time";
    const fmt = (d) => new Date(d).toLocaleDateString();
    if (f.$gte && f.$lte) {
      const s = new Date(f.$gte).toDateString();
      const e = new Date(f.$lte).toDateString();
      const today = new Date().toDateString();
      if (s === today && e === today) return "Today";
      return s === e ? fmt(f.$gte) : `${fmt(f.$gte)} – ${fmt(f.$lte)}`;
    }
    if (f.$gte) return `From ${fmt(f.$gte)}`;
    if (f.$lte) return `Until ${fmt(f.$lte)}`;
  } catch { /* noop */ }
  return "Range";
});

const fetchSummary = async () => {
  try {
    const params = { branchId: branchId.value || "__all__" };
    const f = typeof summaryDateFilter.value === "string"
      ? summaryDateFilter.value
      : JSON.stringify(summaryDateFilter.value || {});
    if (f && f !== "{}") params.createdAt = f;
    const res = await api.request({
      method: "GET",
      url: "api/dashboard/summary",
      params,
      headers: { Authorization: `Bearer ${getToken("token")}` },
    });
    if (res.data?.data) summaryData.value = res.data.data;
  } catch (e) {
    // keep prior data
  } finally {
    summaryLoaded.value = true;
  }
};

watch(summaryDateFilter, fetchSummary);
watch(branchId, fetchSummary);
onMounted(fetchSummary);

const salesTotals = computed(() => summaryData.value.sales);
const purchaseTotals = computed(() => summaryData.value.purchase);
const grossProfit = computed(() => (summaryData.value.sales.amount || 0) - (summaryData.value.purchase.amount || 0));

const dashboardLoaded = computed(() => !!dashboardDataStore.dataList?.value);

const accountsTotal = computed(() => {
  const arr = dashboardDataStore.dataList?.value?.accounts || [];
  return arr.reduce((a, c) => a + Number(c.balance || 0), 0);
});

const totalAssets = computed(() => {
  const d = dashboardDataStore.dataList?.value || {};
  return accountsTotal.value
    + Number(d.stockValue || 0)
    + Number(d.totalDue || 0)
    + Number(d.prepaidPurchases || 0);
});
const totalLiabilities = computed(() => {
  const d = dashboardDataStore.dataList?.value || {};
  return Number(d.totalSupplierDue || 0)
    + Number(d.unpaidExpenses || 0)
    + Number(d.unpaidSalary || 0);
});
const netBusinessValue = computed(() => totalAssets.value - totalLiabilities.value);

const financialDetailCards = computed(() => {
  const d = dashboardDataStore.dataList?.value || {};
  return [
    { label: "Customer Due", value: d.totalDue, color: "text-red-700", note: "Unpaid invoices (receivable)" },
    { label: "Supplier Due", value: d.totalSupplierDue, color: "text-orange-700", note: "Purchase dues (payable)" },
    { label: "Unpaid Expenses", value: d.unpaidExpenses, color: "text-amber-700", note: "Expenses pending payment" },
    { label: "Prepaid to Suppliers", value: d.prepaidPurchases, color: "text-teal-700", note: "Paid for pending purchases" },
    { label: "Unpaid Salary", value: d.unpaidSalary, color: "text-pink-700", note: "Payroll expected − paid this month" },
  ];
});

const salesPeriodCards = computed(() => {
  const d = dashboardDataStore.dataList?.value || {};
  return [
    { label: "Today", amount: d.todaySales || 0, due: d.todaySalesDues || 0 },
    { label: "This Week", amount: d.thisWeekSales || 0, due: d.thisWeekSalesDues || 0 },
    { label: "This Month", amount: d.thisMonthSales || 0, due: d.thisMonthSalesDues || 0 },
    { label: "This Year", amount: d.thisYearSales || 0, due: d.thisYearSalesDues || 0 },
  ];
});

const purchasePeriodCards = computed(() => {
  const d = dashboardDataStore.dataList?.value || {};
  return [
    { label: "Today", amount: d.todayPurchase || 0, due: d.todayPurchaseDues || 0 },
    { label: "This Week", amount: d.thisWeekPurchase || 0, due: d.thisWeekPurchaseDues || 0 },
    { label: "This Month", amount: d.thisMonthPurchase || 0, due: d.thisMonthPurchaseDues || 0 },
    { label: "This Year", amount: d.thisYearPurchase || 0, due: d.thisYearPurchaseDues || 0 },
  ];
});

const inventoryCards = computed(() => {
  const d = dashboardDataStore.dataList?.value || {};
  return [
    { label: "Stock Value", value: d.stockValue, color: "text-blue-700", note: "Stock qty × buy price" },
    { label: "Total Products", value: d.products, color: "text-slate-700", note: "Distinct product SKUs" },
    { label: "Low In Stock", value: d.lowStockProducts, color: "text-red-600", note: "Stock below low-stock alert" },
    { label: "Stock Out", value: d.outOfStockProducts, color: "text-red-700", note: "Products with zero stock" },
    { label: "On Warranty", value: d.onWarranties, color: "text-gray-700", note: "Sold products under active warranty" },
    { label: "Active Bundles", value: summaryData.value.erp?.activeBundles || 0, color: "text-indigo-700", note: "Bundle definitions" },
    { label: "Productions (Month)", value: summaryData.value.erp?.productionsThisMonth || 0, color: "text-emerald-700", note: "Completed this calendar month" },
    { label: "Adjustments (Month)", value: summaryData.value.erp?.adjustmentsThisMonth || 0, color: "text-rose-700", note: "Active adjustments this month" },
    { label: "Total Contacts", value: d.contacts, color: "text-amber-700", note: "Customers + suppliers" },
    { label: "Total Suppliers", value: d.suppliers, color: "text-teal-700", note: "Contacts marked supplier" },
    { label: "Total Staff", value: d.employees, color: "text-purple-700", note: "Employee records" },
    { label: "Total Users", value: d.users, color: "text-orange-700", note: "Login-capable users" },
  ];
});

const totals = computed(() => ({
  cashIn: summaryData.value.cash?.cashIn || 0,
  cashOut: summaryData.value.cash?.cashOut || 0,
  net: summaryData.value.cash?.net || 0,
}));

const counts = computed(() => ({
  cashIn: summaryData.value.cash?.cashInCount || 0,
  cashOut: summaryData.value.cash?.cashOutCount || 0,
}));

const activitySummary = computed(() => {
  const src = summaryData.value.byActivity || {};
  const map = {};
  for (const key of ALL_ACTIVITIES) {
    map[key] = { activity: sentenceCase(key), cashIn: 0, cashOut: 0 };
  }
  for (const key of Object.keys(src)) {
    if (!map[key]) map[key] = { activity: sentenceCase(key), cashIn: 0, cashOut: 0 };
    map[key].cashIn = src[key].cashIn || 0;
    map[key].cashOut = src[key].cashOut || 0;
  }
  return Object.values(map).sort((a, b) => (b.cashIn + b.cashOut) - (a.cashIn + a.cashOut));
});

const visibleActivities = computed(() => {
  if (showAllActivities.value) return activitySummary.value;
  return activitySummary.value.filter((r) => r.cashIn || r.cashOut);
});

const activityPct = (row, side) => {
  const total = (row.cashIn || 0) + (row.cashOut || 0);
  if (!total) return 0;
  return Math.round(((side === "in" ? row.cashIn : row.cashOut) / total) * 100);
};
const compactNumber = (val) => {
  const n = Number(val) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e7) return (n / 1e7).toFixed(2) + "Cr";
  if (abs >= 1e5) return (n / 1e5).toFixed(2) + "L";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
};

const formatMonth = (raw) => {
  const d = new Date(raw);
  if (!isNaN(d)) return d.toLocaleString("en-US", { month: "short" });
  return String(raw);
};

const baseAreaOptions = (accent) => ({
  chart: {
    type: "area",
    toolbar: { show: false },
    zoom: { enabled: false },
    fontFamily: "inherit",
    sparkline: { enabled: false },
  },
  dataLabels: { enabled: false },
  stroke: { curve: "smooth", width: 3 },
  colors: [accent],
  fill: {
    type: "gradient",
    gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.02, stops: [0, 95] },
  },
  markers: {
    size: 4,
    strokeWidth: 2,
    strokeColors: "#fff",
    colors: [accent],
    hover: { size: 6 },
  },
  grid: {
    borderColor: "#f1f5f9",
    strokeDashArray: 4,
    padding: { left: 8, right: 8, top: 0, bottom: 0 },
  },
  tooltip: {
    theme: "light",
    y: { formatter: (v) => Number(v).toLocaleString() + " /-" },
    style: { fontSize: "12px" },
  },
  legend: { show: false },
});

const chartOptions = computed(() => ({
  ...baseAreaOptions("#3b82f6"),
  xaxis: {
    categories: dashboardDataStore.dataList?.value?.salesBarGraphThisYear?.map((e) => formatMonth(e.date)) || [],
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: { style: { colors: "#6b7280", fontSize: "11px" } },
  },
  yaxis: {
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: {
      style: { colors: "#9ca3af", fontSize: "11px" },
      formatter: compactNumber,
    },
  },
}));

const chartOptions2 = computed(() => ({
  ...baseAreaOptions("#10b981"),
  xaxis: {
    categories: dashboardDataStore.dataList?.value?.salesBarGraph7Days?.map((e) => {
      const d = new Date(e.date);
      return isNaN(d) ? e.date : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }) || [],
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: { style: { colors: "#6b7280", fontSize: "11px" } },
  },
  yaxis: {
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: {
      style: { colors: "#9ca3af", fontSize: "11px" },
      formatter: compactNumber,
    },
  },
}));

const yearStats = computed(() => {
  const arr = dashboardDataStore.dataList?.value?.salesBarGraphThisYear || [];
  const vals = arr.map((e) => Number(e.amount) || 0);
  const total = vals.reduce((a, b) => a + b, 0);
  const peak = vals.length ? Math.max(...vals) : 0;
  const avg = vals.length ? total / vals.length : 0;
  return { total, peak, avg };
});

const weekStats = computed(() => {
  const arr = dashboardDataStore.dataList?.value?.salesBarGraph7Days || [];
  const vals = arr.map((e) => Number(e.amount) || 0);
  const total = vals.reduce((a, b) => a + b, 0);
  const peak = vals.length ? Math.max(...vals) : 0;
  const avg = vals.length ? total / vals.length : 0;
  return { total, peak, avg };
});
const series = computed(() => {
  if (dashboardDataStore.dataList?.value?.salesBarGraphThisYear) {
    const graphSeries = [
      {
        name: "sales",
        data: dashboardDataStore.dataList?.value?.salesBarGraphThisYear.map((e) => floatToFixed(e.amount)),
      },
    ];
    return graphSeries;
  } else {
    return [];
  }
});
const series2 = computed(() => {
  if (dashboardDataStore.dataList?.value?.salesBarGraph7Days) {
    const graphSeries = [
      {
        name: "sales",
        data: dashboardDataStore.dataList?.value?.salesBarGraph7Days.map((e) => floatToFixed(e.amount)),
      },
    ];
    return graphSeries;
  } else {
    return [];
  }
});

</script>
