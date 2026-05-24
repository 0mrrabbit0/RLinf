import React from "react";
import { Button, Empty, Typography, Card } from "antd";
import { PlusOutlined, ClusterOutlined } from "@ant-design/icons";

const { Title, Paragraph } = Typography;

const NodeManager: React.FC = () => {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Title level={3} style={{ color: "rgba(255,255,255,0.85)", margin: 0 }}>
          节点管理
        </Title>
        <Button type="primary" icon={<PlusOutlined />} disabled>
          添加节点
        </Button>
      </div>

      <Card
        style={{
          background: "#1f1f1f",
          borderColor: "#303030",
          minHeight: 400,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Empty
          image={
            <ClusterOutlined
              style={{ fontSize: 64, color: "rgba(255,255,255,0.15)" }}
            />
          }
          description={
            <div>
              <Paragraph
                style={{
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 16,
                  marginBottom: 4,
                }}
              >
                暂无注册节点
              </Paragraph>
              <Paragraph
                style={{ color: "rgba(255,255,255,0.25)", fontSize: 13 }}
              >
                节点管理功能将在 Phase 3 中实现。届时可通过 SSH
                注册远程节点并管理 Ray 集群。
              </Paragraph>
            </div>
          }
        />
      </Card>
    </div>
  );
};

export default NodeManager;
