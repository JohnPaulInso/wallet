# Smart Wallet Project Report

## Abstract

Smart Wallet is a mobile-first personal finance application created to help users manage their money in a simpler and more intelligent way. The system allows users to log in, switch wallet accounts, add and track transactions, and view monthly spending through a dashboard with visual charts and summaries. Its main strength is the integration of AI through the AI Summary card and the Recurring Expenses card. The AI Summary card helps explain spending behavior in simple language, while the recurring-expense feature highlights repeated monthly costs that affect the user’s budget. Overall, the project aims to make personal finance tracking easier to understand, more practical, and more useful in everyday life.

## Introduction

Managing money is not always difficult because of a lack of data, but because of a lack of clear understanding. Many users can see their transactions, but they still struggle to know where their money is going, which habits are affecting their budget, and what expenses keep repeating every month. Smart Wallet was developed to solve this problem by combining a simple wallet tracker with visual dashboard analytics and AI-based financial insight. Instead of only storing expense records, the app is designed to help users understand their spending in a more readable and practical way.

## 1) Background of the Study

Personal finance applications are now widely used for tracking expenses, but many of them still focus mainly on recording transactions and showing basic charts. While that is useful, it often leaves the user with the job of analyzing the results alone. In real-life budgeting, users usually want something more helpful. They want a system that not only tracks spending, but also gives a quick understanding of what is happening financially each month. Smart Wallet was designed with this need in mind. It combines transaction tracking, dashboard visuals, account switching, and AI-assisted summaries to make personal finance monitoring easier and more meaningful.

## 2) Problem Statement

Many users find it hard to manage their monthly spending because traditional tracking tools often stop at showing lists, totals, or charts. These tools may show what was spent, but they do not always explain the reason behind spending patterns or highlight which costs are recurring and becoming financially important. Because of this, users may miss repeated expenses, overspend in certain habits, or fail to notice budget pressure early enough. The problem addressed by this project is how to create a personal finance app that not only records expenses, but also helps users understand them more clearly through simple dashboard analytics and AI-generated insights.

## 3) Project Objectives

The main objective of Smart Wallet is to build a personal finance app that is simple to use, visually clear, and helpful for monthly spending awareness. More specifically, the project aims to let users log in securely, switch between wallet accounts, add new transactions, and track all monthly expenses through a dashboard. It also aims to provide visual summaries through a donut chart and line chart, while adding more value through an AI Summary card and a recurring-expenses section that helps users spot repeating spending patterns. The overall objective is to make expense tracking more understandable and useful for everyday decision-making.

## Project Scope

### 1) Included Features

Smart Wallet includes the core features needed for day-to-day expense tracking and monthly financial review. Users can log in, manage wallet accounts, add and edit transactions, and monitor their expenses in a monthly dashboard. The dashboard presents spending information through summary cards, a donut chart, and a line chart. The system also includes an AI Summary card that explains spending behavior in a simple way, as well as a recurring-expenses section that highlights repeated costs. Additional support features include budgeting, goals tracking, notifications, and privacy-related controls.

### 2) Excluded Features

The project does not focus on advanced enterprise-level finance functions. It does not include full accounting modules, tax computation, investment portfolio management, or shared multi-user finance collaboration. It also does not currently include a full automated testing system or a highly detailed backend reporting environment. The project is centered mainly on personal wallet tracking, dashboard monitoring, and intelligent monthly expense insight.

## Methodology

The development of Smart Wallet followed a practical feature-based approach. The first step was building the basic finance workflow, including authentication, transaction storage, wallet account switching, and dashboard rendering. After that, the project expanded into analytics by adding monthly charts and summary widgets to make spending easier to understand. Once the dashboard foundation was stable, the intelligent features were added, particularly the AI Summary card and the recurring-expense section. These features were designed to improve the usefulness of the app by helping users understand not just what they spent, but also the patterns behind their spending.

## Background and Problem Context

The project is based on the idea that many people already have access to their financial data, but not enough help interpreting it. Users can often see transactions from wallets, bank activity, or manual entries, yet still feel uncertain about their actual monthly position. A simple list of expenses is not always enough to reveal patterns such as repeated subscriptions, habit-based spending, or growing monthly pressure. Smart Wallet responds to this problem by organizing the information into a more readable dashboard and adding AI-generated insight so the user can quickly understand the bigger picture.

## Context and Motivation

The motivation behind Smart Wallet is to create a finance app that feels more supportive than a basic expense tracker. The app is designed for users who want something simple enough to use regularly, but intelligent enough to explain their spending in a useful way. The inclusion of the AI Summary card and recurring-expense tracking reflects this goal directly. These features are meant to save users time, improve financial awareness, and make monthly spending patterns easier to recognize without requiring deep manual analysis.

## 🔑 Core Project Overview

Smart Wallet is a mobile-first personal finance application designed to help users track, understand, and control their money in one place. The app allows users to log in, switch wallet accounts, add new transactions, and monitor all expenses for the month through a dashboard interface. Instead of functioning only as an expense recorder, it is built to give a clearer picture of the user’s financial activity through visual summaries and simple insight tools. The overall design supports quick daily checking, so the user can open the app and immediately see their current financial position.

## 🧠 Main Idea / Innovation

The main innovation of Smart Wallet is that it treats financial data as something to understand, not just something to store. Rather than showing only totals and graphs, the app includes an AI Summary card that explains spending behavior in sentence form. It also includes a recurring-expenses section that helps users spot repeated monthly costs. Together, these features make the app feel more intelligent and helpful than a standard wallet tracker. The use of multiple AI paths, including cloud AI and a fallback local AI option, also makes the experience more flexible and reliable.

## ❗ Problem Being Solved

The project solves the problem of unclear monthly spending awareness. Many users can record expenses, but they still find it difficult to understand which habits are affecting their budget, which expenses keep repeating, and whether their spending is healthy or risky. Smart Wallet addresses this by combining expense tracking, dashboard visuals, and AI-supported summaries into one app experience.

## 🎯 Project Objectives

The project aims to provide users with a simple but smart financial tracking tool. Its goal is to make login, wallet switching, transaction entry, and monthly expense review easy to perform. It also aims to improve understanding by presenting spending through charts, summaries, AI explanation, and recurring-expense tracking instead of relying only on manual review.

## 💡 Proposed Solution

The proposed solution is a wallet dashboard application where users can manage transactions and instantly view their monthly spending through clear visual analytics. The dashboard includes a donut chart, a line chart, a spending summary, an AI Summary card, and a recurring-expense section. This combination helps the user move from raw transaction tracking to actual financial understanding.

## 📦 Scope

- User login
- Wallet account switching
- Add and manage transactions
- Monthly expense tracking
- Dashboard summaries
- Donut chart and line chart
- AI Summary card
- Recurring-expense monitoring
- Basic budgeting and goals support

## 🛠️ Technology Stack

- Frontend: HTML, CSS, JavaScript
- Backend and database: Firebase
- Authentication: Google sign-in
- Native mobile support: Capacitor
- Charts: Chart.js
- AI integration: ChatGPT, Gemini, and LocalAI / Edge AI fallback

## 🏗️ System Architecture

Smart Wallet uses a simple client-based architecture connected to Firebase. The user logs in through Google authentication, and transaction data is loaded into the app dashboard. Once the data is available, the system updates the charts, summary cards, and intelligence features. The AI Summary card reads the transaction activity and turns it into a short explanation, while the recurring-expense section identifies repeated spending patterns. This architecture keeps the app straightforward while still supporting intelligent features.

## 🗃️ Database Tables

The project uses Firebase Firestore to store user-related data. At a simple level, the system keeps user records, transaction collections, wallet account data, goals data, and notification data. The database is mainly used to support login-based storage, transaction history, and dashboard updates. Since the project focuses more on user experience than deep database complexity, the structure remains centered on storing wallet activity and related finance records.

## 🧪 Testing Summary

Testing for the project is currently focused more on manual feature checking than on automated test scripts. Important functions that would typically be checked include login, switching wallet accounts, adding transactions, updating dashboard charts, viewing AI summaries, and detecting recurring expenses. While the application already shows strong practical functionality, automated testing can still be improved in future development.

## 📅 Timeline (4 Weeks)

- Week 1: Set up the project structure, login system, and transaction storage
- Week 2: Build the wallet dashboard, transaction flow, and charts
- Week 3: Add AI Summary and recurring-expense tracking
- Week 4: Refine the interface, improve usability, and finalize the project

## 📈 Key Achievements / Lessons

One of the biggest achievements of the project is the successful integration of AI into a personal finance dashboard in a way that feels useful rather than unnecessary. The app does not only record transactions, but also helps explain financial behavior. Another key achievement is the recurring-expense section, which adds more awareness to repeated monthly spending. A major lesson from the project is that finance apps become much more useful when they combine clear visuals with short, readable insights instead of relying only on raw data and charts.

## 🚀 Future Improvements

Future improvements for Smart Wallet could include stronger automated testing, more advanced recurring-expense prediction, better reporting features, and more secure handling for external AI requests. The app could also expand into smarter budgeting suggestions, improved goal forecasting, and more personalized monthly financial recommendations. These improvements would make the system even more helpful as a long-term financial assistant.
