import React from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { ConfigProvider, Layout, theme } from "antd";
import {
  ClusterOutlined,
  CloudServerOutlined,
  FileTextOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import Dashboard from "@/pages/Dashboard";
import Templates from "@/pages/Templates";
import TaskCreate from "@/pages/TaskCreate";
import TaskList from "@/pages/TaskList";
import TaskDetail from "@/pages/TaskDetail";
import NodeManager from "@/pages/NodeManager";
import ConfigEditorPage from "@/pages/ConfigEditorPage";
import Settings from "@/pages/Settings";

const { Header, Content, Footer } = Layout;

const TAB_ITEMS = [
  { key: "/nodes", label: "节点管理", icon: <ClusterOutlined /> },
  { key: "/configs", label: "配置编辑", icon: <FileTextOutlined /> },
  { key: "/tasks", label: "云边联合任务", icon: <CloudServerOutlined /> },
  { key: "/settings", label: "设置", icon: <SettingOutlined /> },
] as const;

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const activeTab = TAB_ITEMS.find((tab) =>
    location.pathname.startsWith(tab.key),
  )?.key ?? "/nodes";

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorBgBase: "#141414",
          colorPrimary: "#1668dc",
          borderRadius: 6,
        },
      }}
    >
      <Layout style={{ minHeight: "100vh", background: "#141414" }}>
        <Header
          style={{
            display: "flex",
            alignItems: "center",
            background: "#1f1f1f",
            borderBottom: "1px solid #303030",
            padding: "0 24px",
            height: 56,
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#1668dc",
              letterSpacing: 1,
              cursor: "pointer",
            }}
            onClick={() => navigate("/")}
          >
            RLinf Studio
          </div>
        </Header>

        <Content
          style={{
            flex: 1,
            padding: 24,
            overflow: "auto",
            background: "#141414",
          }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/tasks" element={<TaskList />} />
            <Route path="/tasks/create" element={<TaskCreate />} />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            <Route path="/nodes" element={<NodeManager />} />
            <Route path="/configs" element={<ConfigEditorPage />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Content>

        <Footer
          style={{
            padding: 0,
            background: "#1f1f1f",
            borderTop: "1px solid #303030",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
              height: 56,
            }}
          >
            {TAB_ITEMS.map((tab) => (
              <div
                key={tab.key}
                onClick={() => navigate(tab.key)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  cursor: "pointer",
                  color: activeTab === tab.key ? "#1668dc" : "rgba(255,255,255,0.45)",
                  fontSize: 12,
                  transition: "color 0.2s",
                  flex: 1,
                  padding: "8px 0",
                }}
              >
                <span style={{ fontSize: 20 }}>{tab.icon}</span>
                <span>{tab.label}</span>
              </div>
            ))}
          </div>
        </Footer>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
