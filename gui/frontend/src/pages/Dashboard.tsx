import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, Space, Typography } from "antd";
import {
  PlusCircleOutlined,
  ClusterOutlined,
  AppstoreOutlined,
  FileTextOutlined,
} from "@ant-design/icons";

const { Title, Paragraph } = Typography;

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        textAlign: "center",
      }}
    >
      <Title
        level={1}
        style={{
          color: "#1668dc",
          fontSize: 48,
          fontWeight: 800,
          marginBottom: 8,
          letterSpacing: 2,
        }}
      >
        RLinf Studio
      </Title>
      <Paragraph
        style={{
          color: "rgba(255,255,255,0.65)",
          fontSize: 16,
          maxWidth: 520,
          marginBottom: 40,
        }}
      >
        分布式强化学习训练与推理管理平台。支持云边联合任务编排、多节点集群管理、
        配置模板化创建与可视化监控。
      </Paragraph>

      <Space size="large">
        <Button
          type="primary"
          size="large"
          icon={<PlusCircleOutlined />}
          onClick={() => navigate("/templates")}
        >
          创建任务
        </Button>
        <Button
          size="large"
          icon={<ClusterOutlined />}
          onClick={() => navigate("/nodes")}
        >
          管理节点
        </Button>
        <Button
          size="large"
          icon={<AppstoreOutlined />}
          onClick={() => navigate("/tasks")}
        >
          查看任务
        </Button>
        <Button
          size="large"
          icon={<FileTextOutlined />}
          onClick={() => navigate("/configs")}
        >
          配置编辑
        </Button>
      </Space>
    </div>
  );
};

export default Dashboard;
