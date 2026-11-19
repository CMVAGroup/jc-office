// Synthetic data, exact reviewed route shape; never a live response or real customer data.
export const cmvaFixture = {
  is_demo: true,
  generated_at: '2027-01-01T00:15:00.000Z',
  stores: [
    {
      store: 'test-shop',
      note: "Dates are DD-MM in the shop's own timezone. Amounts in EUR.",
      totals: {
        days: 2,
        orders: 3,
        revenue_eur: 120.39,
        ad_spend_eur: 30,
        cogs_eur: 40,
        transaction_fees_eur: 2.4,
        refunds_eur: 0,
        profit_eur: 47.99,
        roas: 4.01,
      },
      per_day: [
        {
          date: '31-12',
          orders: 2,
          revenue_eur: 100.29,
          ad_spend_eur: 30,
          cogs_eur: 40,
          transaction_fees_eur: 2.4,
          refunds_eur: 0,
          front_end_profit_eur: 30.29,
          profit_eur: 27.89,
          roas: 3.34,
        },
        {
          date: '01-01',
          orders: 1,
          revenue_eur: 20.1,
          ad_spend_eur: 0,
          cogs_eur: 0,
          transaction_fees_eur: 0,
          refunds_eur: 0,
          front_end_profit_eur: 20.1,
          profit_eur: 20.1,
          roas: null,
        },
      ],
      products: [
        {
          name: 'Demo product',
          status: 'test',
          cost_eur: 10,
          sell_eur: 30,
          active_ads: 1,
          test_date: '31-12',
          kill_reason: 'Demo',
        },
        { cost_eur: 0, sell_eur: 0, active_ads: 0 },
      ],
      expenses: [
        { name: 'Demo expense', amount_eur: 5.99, date: '31-12', category: 'demo' },
        { amount_eur: 0 },
      ],
    },
  ],
};
